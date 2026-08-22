const http = require('http');
const crypto = require('crypto');

function buildDigestHeader(method, uri, wwwAuth, user, pass) {
  const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
  const nonceMatch = wwwAuth.match(/nonce="([^"]+)"/);
  const qopMatch = wwwAuth.match(/qop="([^"]+)"/);
  const opaqueMatch = wwwAuth.match(/opaque="([^"]+)"/);

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

async function testFetchEvents() {
  console.log('=== TESTING HIKVISION ACSEVENT FETCH ===');
  const ip = '192.168.1.63';
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `http://${ip}${uri}`;

  const postData = JSON.stringify({
    AcsEventCond: {
      searchID: '1',
      searchResultPosition: 0,
      maxResults: 30,
      major: 0,
      minor: 0,
      startTime: '2026-08-22T00:00:00+05:30',
      endTime: '2026-08-22T23:59:59+05:30',
      timeReverseOrder: true,
    },
  });

  const sendReq = (headers = {}) => {
    return new Promise((resolve) => {
      const u = new URL(url);
      const req = http.request({
        hostname: u.hostname,
        port: 80,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(postData)),
          ...headers,
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
      });
      req.on('error', err => resolve({ error: err.message }));
      req.write(postData);
      req.end();
    });
  };

  console.log('Step 1: Unauthenticated POST...');
  const res1 = await sendReq();
  console.log('Res1 Status:', res1.status);

  if (res1.status === 401) {
    const wwwAuth = res1.headers['www-authenticate'] || '';
    console.log('Www-Authenticate:', wwwAuth);
    const authHeader = buildDigestHeader('POST', uri, wwwAuth, 'admin', 'Deepak@1509');

    console.log('Step 2: Authenticated POST...');
    const res2 = await sendReq({ Authorization: authHeader });
    console.log('Res2 Status:', res2.status);
    if (res2.data) {
      const obj = JSON.parse(res2.data);
      const list = obj?.AcsEvent?.InfoList || [];
      console.log(`Fetched ${list.length} records from machine!`);
      if (list.length > 0) {
        console.log('First record sample:', list[0]);
      }
    }
  }
}

testFetchEvents();
