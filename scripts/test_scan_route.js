const { getHikvisionDeviceInfo } = require('../src/lib/hikvision');

async function testScanRoute() {
  const start = Date.now();
  console.log('Testing getHikvisionDeviceInfo()...');
  const info = await getHikvisionDeviceInfo();
  console.log(`Finished in ${Date.now() - start}ms! Output:`, info);
}

testScanRoute();
