const http = require('http');

function testProbe() {
  const start = Date.now();
  console.log('Testing direct HTTP probe to 192.168.1.63...');
  const req = http.get('http://192.168.1.63/ISAPI/System/deviceInfo', (res) => {
    console.log(`Probe response! Status ${res.statusCode} in ${Date.now() - start}ms`);
  });
  req.on('error', (e) => console.log('Error:', e.message));
}

testProbe();
