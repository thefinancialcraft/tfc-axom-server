const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

const HIK_IP = process.env.HIKVISION_IP || '192.168.1.63';
const HIK_USER = process.env.HIKVISION_USER || 'admin';
const HIK_PASS = process.env.HIKVISION_PASS || 'Deepak@1509';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function fetchHikvision(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const postData = options.body || '';

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        ...(options.headers || {}),
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(reqOptions, (res) => {
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

async function syncAllEmployeeData() {
  console.log('=====================================================');
  console.log('🚀 FETCHING ALL HISTORICAL EMPLOYEE RECORDS FROM MACHINE');
  console.log('=====================================================');

  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `https://${HIK_IP}${uri}`;

  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const todayEnd = `${YYYY}-${MM}-${DD}T23:59:59+05:30`;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const recordsToInsert = [];
  const processedSet = new Set();

  let searchPosition = 0;
  const maxResults = 500;
  let totalFetched = 0;

  for (let page = 0; page < 10; page++) {
    const postData = JSON.stringify({
      AcsEventCond: {
        searchID: '1',
        searchResultPosition: searchPosition,
        maxResults: maxResults,
        major: 5,
        minor: 0,
        startTime: `2020-01-01T00:00:00+05:30`,
        endTime: todayEnd,
        timeReverseOrder: true,
      },
    });

    let res = await fetchHikvision(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postData,
    });

    if (res.status === 401) {
      const wwwAuth = res.headers['www-authenticate'] || '';
      const digestHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);

      res = await fetchHikvision(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: digestHeader,
        },
        body: postData,
      });
    }

    if (!res.ok) {
      console.error(`❌ Request failed at position ${searchPosition}: ${res.status}`);
      break;
    }

    const data = await res.json();
    const infoList = data?.AcsEvent?.InfoList || [];
    if (infoList.length === 0) break;

    totalFetched += infoList.length;

    for (const event of infoList) {
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

      if (!processedSet.has(entry_id)) {
        processedSet.add(entry_id);
        const atn_token = `${parsedTime.yearShort}${parsedTime.month}${parsedTime.day}${numericCode}`;
        const employee_id = employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

        recordsToInsert.push({
          entry_id,
          atn_token,
          employee_id,
          user_name: userName,
          attendance_date: parsedTime.dateStr,
          attendance_time: parsedTime.timeStr24,
          serial_no: serial,
        });
      }
    }

    searchPosition += infoList.length;
    if (infoList.length < maxResults) break;
  }

  console.log(`📋 Total Events Fetched from Device: ${totalFetched}`);
  console.log(`🆕 Unique Valid Employee Records Extracted: ${recordsToInsert.length}`);

  if (recordsToInsert.length > 0 && supabase) {
    console.log(`🚀 Upserting ${recordsToInsert.length} records into Supabase Cloud DB in batches...`);
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < recordsToInsert.length; i += batchSize) {
      const batch = recordsToInsert.slice(i, i + batchSize);
      const supaPayload = batch.map((r) => ({
        entry_id: r.entry_id,
        atn_token: r.atn_token,
        employee_id: r.employee_id,
        user_name: r.user_name,
        attendance_date: r.attendance_date,
        attendance_time: r.attendance_time,
      }));

      const { error: insertErr } = await supabase
        .from('attendance_log')
        .upsert(supaPayload, { onConflict: 'entry_id' });

      if (insertErr) {
        console.error(`❌ Batch ${i / batchSize + 1} Error:`, insertErr.message);
      } else {
        insertedCount += batch.length;
        console.log(`✅ Batch ${i / batchSize + 1}: Upserted ${batch.length} records!`);
      }
    }

    console.log(`\n🎉 TOTAL EMPLOYEE RECORDS SAVED TO SUPABASE CLOUD DB: ${insertedCount}!`);
  }
}

syncAllEmployeeData();
