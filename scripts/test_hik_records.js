const http = require('http');
const https = require('https');
const crypto = require('crypto');

const HIK_IP = '192.168.1.63';
const HIK_USER = 'admin';
const HIK_PASS = 'Deepak@1509';

function fetchHik(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const postData = options.body || '';
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    };

    const req = mod.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data || '{}')),
        });
      });
    });

    req.setTimeout(3000, () => req.destroy(new Error('Timeout')));
    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

function buildDigestHeader(method, uri, wwwAuthHeader, user, pass) {
  const realmMatch = wwwAuthHeader.match(/realm="([^"]+)"/);
  const nonceMatch = wwwAuthHeader.match(/nonce="([^"]+)"/);
  const qopMatch = wwwAuthHeader.match(/qop="([^"]+)"/);
  const opaqueMatch = wwwAuthHeader.match(/opaque="([^"]+)"/);

  const realm = realmMatch ? realmMatch[1] : '';
  const nonce = nonceMatch ? nonceMatch[1] : '';
  const qop = qopMatch ? qopMatch[1] : '';
  const opaque = opaqueMatch ? opaqueMatch[1] : '';

  const ha1 = crypto.createHash('md5').update(`${user}:${realm}:${pass}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

  if (qop) {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex');
    let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    if (opaque) header += `, opaque="${opaque}"`;
    return header;
  } else {
    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (opaque) header += `, opaque="${opaque}"`;
    return header;
  }
}

async function testPagination() {
  console.log('=== TESTING HIKVISION ISAPI PAGINATION ===');
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `http://${HIK_IP}${uri}`;

  let totalFetchedEvents = 0;
  let totalPunchEvents = 0;

  for (let page = 0; page < 20; page++) {
    const searchPosition = page * 30;
    const postData = JSON.stringify({
      AcsEventCond: {
        searchID: `${page + 1}`,
        searchResultPosition: searchPosition,
        maxResults: 30,
        major: 0,
        minor: 0,
        startTime: '2020-01-01T00:00:00+05:30',
        endTime: '2030-12-31T23:59:59+05:30',
        timeReverseOrder: true,
      },
    });

    let res = await fetchHik(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postData,
    });

    if (res.status === 401) {
      const wwwAuth = res.headers['www-authenticate'] || '';
      const digest = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);
      res = await fetchHik(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: digest,
        },
        body: postData,
      });
    }

    const json = await res.json();
    const acsObj = json?.AcsEvent || {};
    const infoList = acsObj?.InfoList || [];
    const responseStatusStrg = acsObj?.responseStatusStrg;
    const numOfMatches = acsObj?.numOfMatches;
    const totalMatches = acsObj?.totalMatches;

    const punchesInChunk = infoList.filter(e => (e.employeeNoString || e.employeeNo || e.cardNo));

    totalFetchedEvents += infoList.length;
    totalPunchEvents += punchesInChunk.length;

    console.log(`Page #${page + 1}: fetched ${infoList.length} items (Punches: ${punchesInChunk.length}) | totalMatches: ${totalMatches}, numOfMatches: ${numOfMatches}, status: ${responseStatusStrg}`);

    if (infoList.length === 0 || responseStatusStrg === 'NO MATCH') {
      console.log(`Pagination finished at page #${page + 1}.`);
      break;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total Events Fetched across pages: ${totalFetchedEvents}`);
  console.log(`Total Punch Events (with Employee No): ${totalPunchEvents}`);
}

testPagination();
