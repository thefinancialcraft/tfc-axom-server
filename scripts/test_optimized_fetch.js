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

    req.setTimeout(2500, () => req.destroy(new Error('Timeout')));
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

async function testOptimizedFetch() {
  console.log('=== TESTING OPTIMIZED SMOOTH HIKVISION FETCH ===');
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `http://${HIK_IP}${uri}`;

  let cachedAuthHeader = null;
  let totalEvents = 0;
  let totalPunches = 0;

  for (let page = 0; page < 10; page++) {
    const searchPosition = page * 30;
    const postData = JSON.stringify({
      AcsEventCond: {
        searchID: String(page + 1),
        searchResultPosition: searchPosition,
        maxResults: 30,
        major: 0,
        minor: 0,
        startTime: '2020-01-01T00:00:00+05:30',
        endTime: '2030-12-31T23:59:59+05:30',
        timeReverseOrder: true,
      },
    });

    const headers = { 'Content-Type': 'application/json' };
    if (cachedAuthHeader) {
      headers['Authorization'] = cachedAuthHeader;
    }

    let res = await fetchHik(url, { method: 'POST', headers, body: postData });

    if (res.status === 401) {
      const wwwAuth = res.headers['www-authenticate'] || '';
      cachedAuthHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);
      headers['Authorization'] = cachedAuthHeader;

      res = await fetchHik(url, { method: 'POST', headers, body: postData });
    }

    const json = await res.json();
    const acsObj = json?.AcsEvent || {};
    const infoList = acsObj?.InfoList || [];
    const statusStr = String(acsObj?.responseStatusStrg || '').toUpperCase();

    const punchesInChunk = infoList.filter(e => (e.employeeNoString || e.employeeNo || e.cardNo));
    totalEvents += infoList.length;
    totalPunches += punchesInChunk.length;

    console.log(`Page #${page + 1}: Status ${res.status} | fetched ${infoList.length} items (Punches: ${punchesInChunk.length})`);

    if (infoList.length === 0 || statusStr === 'NO MATCH') break;

    // Small 40ms delay to keep microcontroller web server socket cool
    await new Promise(r => setTimeout(r, 40));
  }

  console.log(`\n✅ COMPLETED SMOOTHLY: Total Events=${totalEvents}, Total Punches=${totalPunches}`);
}

testOptimizedFetch();
