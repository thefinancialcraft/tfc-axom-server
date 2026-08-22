const http = require('http');
const https = require('https');
const { exec } = require('child_process');

function ping(ip) {
  return new Promise((res) => {
    exec(`ping -n 2 ${ip}`, (err, stdout) => {
      res(stdout);
    });
  });
}

function probeUrl(urlStr) {
  return new Promise((resolve) => {
    const isHttps = urlStr.startsWith('https');
    const mod = isHttps ? https : http;
    const t0 = Date.now();

    const req = mod.get(urlStr, { rejectUnauthorized: false }, (res) => {
      resolve({ url: urlStr, status: res.statusCode, time: Date.now() - t0 });
    });
    req.setTimeout(4000, () => {
      req.destroy(new Error('Timeout 4s'));
    });
    req.on('error', (err) => resolve({ url: urlStr, error: err.message, time: Date.now() - t0 }));
  });
}

async function debugAll() {
  console.log('=== STEP 1: PINGING IP 192.168.1.63 ===');
  const pingOut = await ping('192.168.1.63');
  console.log(pingOut);

  console.log('=== STEP 2: PROBING BOTH HTTP AND HTTPS ===');
  const rHttp = await probeUrl('http://192.168.1.63/ISAPI/System/deviceInfo');
  console.log('HTTP Probe:', rHttp);

  const rHttps = await probeUrl('https://192.168.1.63/ISAPI/System/deviceInfo');
  console.log('HTTPS Probe:', rHttps);
}

debugAll();
