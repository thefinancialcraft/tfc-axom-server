const path = require('path');
const fs = require('fs');

// Load .env.local
const envPath = 'c:\\Users\\Deepak\\Desktop\\tfc-axom-server\\.env.local';
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const { syncHikvisionAttendance } = require('./test-direct-machine-helper');
