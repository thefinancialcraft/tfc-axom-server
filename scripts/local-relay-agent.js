// ==============================================================================
// TFC AXOM - LOCAL RELAY AGENT (FOR VERCEL CLOUD DEPLOYMENT)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local
const envPath = path.join(__dirname, '../.env.local');
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

const HIK_IP = process.env.HIKVISION_IP || '192.168.1.63';
const HIK_USER = process.env.HIKVISION_USER || 'admin';
const HIK_PASS = process.env.HIKVISION_PASS || 'Deepak@1509';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_APP_SCRIPT_URL || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: SUPABASE_URL or SUPABASE_ANON_KEY missing in .env.local!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const processedEntryIds = new Set();
const POLL_INTERVAL_MS = 2500;
let isSyncing = false;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

function parseHikTime(timeStr) {
  const match = (timeStr || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const yFull = match[1];
    const month = match[2];
    const day = match[3];
    const dateStr = `${day}/${month}/${yFull}`;
    const hh24 = match[4];
    const mm = match[5];
    const ss = match[6];
    return { dateStr, timeStr24: `${hh24}:${mm}:${ss}`, yearShort: yFull.slice(-2), month, day, YYYY: yFull, hh: hh24, mm, ss };
  }
  const d = new Date(timeStr);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear())}`;
  const timeStr24 = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return { dateStr, timeStr24, yearShort: String(d.getFullYear()).slice(-2), month: String(d.getMonth() + 1).padStart(2, '0'), day: String(d.getDate()).padStart(2, '0'), YYYY: String(d.getFullYear()), hh: String(d.getHours()).padStart(2, '0'), mm: String(d.getMinutes()).padStart(2, '0'), ss: String(d.getSeconds()).padStart(2, '0') };
}

async function fetchHikvisionEvents() {
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `https://${HIK_IP}${uri}`;
  const postData = JSON.stringify({
    AcsEventCond: {
      searchID: '1',
      searchResultPosition: 0,
      maxResults: 500,
      major: 5,
      timeReverseOrder: true,
    },
  });

  const firstRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: postData,
  });

  if (firstRes.status === 401) {
    const wwwAuth = firstRes.headers.get('www-authenticate') || '';
    const digestHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);

    const secondRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: digestHeader,
      },
      body: postData,
    });

    if (!secondRes.ok) {
      throw new Error(`HTTP ${secondRes.status}`);
    }

    return await secondRes.json();
  } else if (firstRes.ok) {
    return await firstRes.json();
  } else {
    throw new Error(`HTTP ${firstRes.status}`);
  }
}

async function initRelay() {
  console.log('====================================================');
  console.log('📡 TFC AXOM - HIKVISION LOCAL RELAY DAEMON AGENT');
  console.log('====================================================');
  console.log(`🌐 Hikvision Machine Target IP: https://${HIK_IP}`);
  console.log(`☁️ Supabase Cloud DB Destination: ${SUPABASE_URL}`);
  console.log(`⏱️ Polling Frequency: Every ${POLL_INTERVAL_MS}ms\n`);

  // Pre-fill processed entries from Supabase
  try {
    const { data: rows } = await supabase.from('attendance_log').select('entry_id').limit(1000);
    if (rows) {
      rows.forEach((r) => processedEntryIds.add(r.entry_id));
      console.log(`📦 Pre-loaded ${processedEntryIds.size} existing entry ID(s) from Supabase Cloud DB.`);
    }
  } catch (err) {
    console.error('⚠️ Could not fetch existing entries from Supabase:', err.message);
  }

  console.log('\n🟢 RELAY AGENT ACTIVE & RUNNING! Press Ctrl+C to stop.\n');

  setInterval(async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      const data = await fetchHikvisionEvents();
      const newRecords = [];

      if (data?.AcsEvent?.InfoList && Array.isArray(data.AcsEvent.InfoList)) {
        for (const event of data.AcsEvent.InfoList) {
          if (event.major !== 5) continue;

          const serial = parseInt(event.serialNo || '0', 10);
          const employeeNo = (
            event.employeeNoString ||
            event.employeeNo ||
            event.cardNo ||
            ''
          ).toString().trim();

          const userName = (
            event.name ||
            event.userType ||
            (employeeNo ? `Employee ${employeeNo}` : '')
          ).toString().trim();

          if (!employeeNo || employeeNo === '--' || employeeNo.toLowerCase() === 'invalid' || !userName) continue;

          const numericCode = employeeNo.replace(/[^0-9]/g, '');
          if (!numericCode) continue;

          const parsedTime = parseHikTime(event.time);
          const dateStamp = `${parsedTime.YYYY}${parsedTime.month}${parsedTime.day}${parsedTime.hh}${parsedTime.mm}${parsedTime.ss}`;
          const entry_id = `T${dateStamp}${numericCode}${serial}`;

          if (!processedEntryIds.has(entry_id)) {
            processedEntryIds.add(entry_id);
            const atn_token = `${parsedTime.yearShort}${parsedTime.month}${parsedTime.day}${numericCode}`;
            const employee_id = employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

            newRecords.push({
              entry_id,
              atn_token,
              employee_id,
              user_name: userName,
              attendance_date: parsedTime.dateStr,
              attendance_time: parsedTime.timeStr24,
            });
          }
        }
      }

      if (newRecords.length > 0) {
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ⚡ NEW PUNCH DETECTED FROM LOCAL MACHINE! Inserting ${newRecords.length} record(s) to Supabase Cloud DB...`);

        const { error } = await supabase.from('attendance_log').insert(newRecords);
        if (error) {
          console.error(`[${time}] ❌ Supabase Insert Error:`, error.message);
        } else {
          console.log(`[${time}] ✅ Successfully pushed ${newRecords.length} record(s) to Supabase Cloud!`);
        }

        if (GOOGLE_SCRIPT_URL) {
          try {
            await fetch(GOOGLE_SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newRecords),
            });
            console.log(`[${time}] ✅ Google Sheets synced!`);
          } catch (gErr) {
            console.error(`[${time}] ⚠️ Google Sheets Sync Error:`, gErr.message);
          }
        }
      }
    } catch (err) {
      // Machine may be offline or unreachable
    } finally {
      isSyncing = false;
    }
  }, POLL_INTERVAL_MS);
}

initRelay();
