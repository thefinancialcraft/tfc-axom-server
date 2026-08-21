const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { syncHikvisionAttendance } = require('../../src/lib/hikvision');

async function test() {
  console.log('Testing syncHikvisionAttendance()...');
  const res = await syncHikvisionAttendance();
  console.log('Sync Result:', res);
}

test();
