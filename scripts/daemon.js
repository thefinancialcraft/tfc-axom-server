// Node.js Daemon script for Hikvision Attendance Sync
// Run with: node scripts/daemon.js

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

// Dynamically import compiled or ts-node runner, or call HTTP endpoint / API
const SYNC_INTERVAL_MS = 2000;
let isSyncing = false;

async function runDaemonLoop() {
  console.log('🚀 TFC Axom Hikvision Attendance Sync Daemon Started');
  console.log(`⏱️ Sync interval set to ${SYNC_INTERVAL_MS}ms`);

  setInterval(async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      // Call local Next.js sync endpoint or internal function
      const res = await fetch('http://localhost:3000/api/sync');
      if (res.ok) {
        const data = await res.json();
        if (data.newRecordsInserted > 0) {
          console.log(`[${new Date().toLocaleTimeString()}] ✅ Synced ${data.newRecordsInserted} new attendance record(s). Max Serial: ${data.lastSerial}`);
        }
      }
    } catch (err) {
      // Server might be initializing or temporary network issue
    } finally {
      isSyncing = false;
    }
  }, SYNC_INTERVAL_MS);
}

runDaemonLoop();
