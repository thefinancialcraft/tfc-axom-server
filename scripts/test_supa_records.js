const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

async function checkSupa() {
  console.log('=== TESTING SUPABASE DIRECT FETCH ===');
  console.log('URL:', url);
  const supa = createClient(url, key);

  const { data, error } = await supa.from('attendance_log').select('*');
  if (error) {
    console.error('Supa Error:', error.message);
  } else {
    console.log(`Total Supabase Records: ${data ? data.length : 0}`);
    if (data && data.length > 0) {
      console.log('Sample record attendance_date:', data[0].attendance_date, 'user_name:', data[0].user_name);
    }
  }
}

checkSupa();
