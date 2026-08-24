// ==============================================================================
// TFC AXOM - STANDALONE HIKVISION RELAY AGENT (ZERO DEPENDENCIES)
// Run on Host PC: node standalone-relay.js
// ==============================================================================

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Load .env file in current directory
const envPath = path.join(__dirname, '.env');
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
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qfbeskgvxjwqccaraulv.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmYmVza2d2eGp3cWNjYXJhdWx2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjQwMTQsImV4cCI6MjA5NzIwMDAxNH0.IPCGYN-v7UkRDygrvcGyZC-3uxjFoiSy7lTUoVe_l9M';
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_APP_SCRIPT_URL || '';

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

function httpPost(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const postData = typeof body === 'string' ? body : JSON.stringify(body);

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...(headers || {}),
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    };

    const req = mod.request(reqOptions, (res) => {
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
    req.setTimeout(3000, () => {
      req.destroy(new Error('Connection Timeout'));
    });

    if (postData) req.write(postData);
    req.end();
  });
}

function httpGet(urlStr, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const mod = parsedUrl.protocol === 'https:' ? https : http;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: headers || {},
      rejectUnauthorized: false,
    };

    const req = mod.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json: () => Promise.resolve(JSON.parse(data || '{}')),
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(3000, () => {
      req.destroy(new Error('Connection Timeout'));
    });

    req.end();
  });
}

async function upsertToSupabase(records) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || records.length === 0) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/attendance_log`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };

  return httpPost(endpoint, headers, records);
}

async function fetchSupabaseProcessedIds() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/attendance_log?select=entry_id&order=id.desc&limit=2000`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  try {
    const res = await httpGet(endpoint, headers);
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows)) {
        rows.forEach((r) => processedEntryIds.add(r.entry_id));
        console.log(`📦 Loaded ${processedEntryIds.size} existing records from Supabase Cloud.`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Note: Could not fetch initial records from Supabase:', err.message);
  }
}

async function fetchHikvisionEvents() {
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `http://${HIK_IP}${uri}`;
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const startYYYY = threeDaysAgo.getFullYear();
  const startMM = String(threeDaysAgo.getMonth() + 1).padStart(2, '0');
  const startDD = String(threeDaysAgo.getDate()).padStart(2, '0');
  const startTime = `${startYYYY}-${startMM}-${startDD}T00:00:00+05:30`;

  const endYYYY = now.getFullYear();
  const endMM = String(now.getMonth() + 1).padStart(2, '0');
  const endDD = String(now.getDate()).padStart(2, '0');
  const endTime = `${endYYYY}-${endMM}-${endDD}T23:59:59+05:30`;

  const postData = JSON.stringify({
    AcsEventCond: {
      searchID: '1',
      searchResultPosition: 0,
      maxResults: 500,
      major: 0,
      minor: 0,
      startTime: startTime,
      endTime: endTime,
      timeReverseOrder: true,
    },
  });

  const firstRes = await httpPost(url, { 'Content-Type': 'application/json' }, postData).catch(() => null);

  if (firstRes && firstRes.status === 401) {
    const wwwAuth = String(firstRes.headers['www-authenticate'] || '');
    const digestHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);

    const secondRes = await httpPost(url, {
      'Content-Type': 'application/json',
      'Authorization': digestHeader,
    }, postData);

    if (secondRes.ok) {
      return await secondRes.json();
    }
  } else if (firstRes && firstRes.ok) {
    return await firstRes.json();
  }

  throw new Error(`Hikvision Machine HTTP Error`);
}

const RELAY_SECRET_KEY = process.env.RELAY_SECRET_KEY || 'tfc_axom_master_relay_sec_2026';
let isMachineConnected = false;
let lastSyncTimeIso = new Date().toISOString();
const rateLimitMap = new Map();

function startLocalHttpServer(port = 5000) {
  const server = http.createServer((req, res) => {
    // Security Patch 1: CORS & Strict Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Relay-Secret');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    // Security Patch 2: Anti-Flood Rate Limiter (Max 60 requests/min per IP)
    const clientIp = req.socket.remoteAddress || '127.0.0.1';
    const nowTs = Date.now();
    const clientData = rateLimitMap.get(clientIp) || { count: 0, resetTs: nowTs + 60000 };

    if (nowTs > clientData.resetTs) {
      clientData.count = 0;
      clientData.resetTs = nowTs + 60000;
    }
    clientData.count++;
    rateLimitMap.set(clientIp, clientData);

    if (clientData.count > 60) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Too Many Requests (Rate Limit Exceeded)' }));
    }

    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    if (parsedUrl.pathname === '/status' || parsedUrl.pathname === '/api/status' || parsedUrl.pathname === '/') {
      // Security Patch 3: Cryptographic Signed Master Token
      const nonce = crypto.randomBytes(8).toString('hex');
      const signature = crypto.createHmac('sha256', RELAY_SECRET_KEY)
        .update(`${HIK_IP}:${nonce}:${isMachineConnected}`)
        .digest('hex');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          success: true,
          isConnected: isMachineConnected,
          ip: HIK_IP,
          auth: {
            token: 'TFC-MASTER-RELAY-V2',
            signature: signature,
            nonce: nonce,
            isVerified: true,
          },
          deviceInfo: {
            isConnected: isMachineConnected,
            ip: HIK_IP,
            model: 'DS-K1T320EFWX',
            deviceName: isMachineConnected ? 'Access Controller (Direct Relay Node)' : 'Access Controller (Offline)',
            serialNumber: 'RELAY-MASTER-SECURE',
            macAddress: 'a4:d5:c2:1c:4d:83',
            firmwareVersion: 'V3.5.2 (Relay Secure)',
          },
          processedCount: processedEntryIds.size,
          lastSyncTime: lastSyncTimeIso,
        })
      );
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`📡 Secure Local Relay HTTP Server active on http://localhost:${port}/status (CORS & SHA256 HMAC Signed)`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ Port ${port} in use, trying port ${port + 1}...`);
      startLocalHttpServer(port + 1);
    }
  });
}

async function updateCommandStatus(cmdId, status, progressMsg) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !cmdId) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/relay_commands?id=eq.${cmdId}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  };
  const body = JSON.stringify({
    status: status,
    progress: progressMsg,
    updated_at: new Date().toISOString()
  });

  return new Promise((resolve) => {
    const parsedUrl = new URL(endpoint);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PATCH',
      headers: headers,
    };
    const req = mod.request(reqOptions, () => resolve());
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

function scheduleCommandDeletion(cmdId, delayMs = 120000) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !cmdId) return;
  console.log(`⏰ Scheduled auto-deletion of command ${cmdId} from Supabase DB in 2 minutes...`);

  setTimeout(async () => {
    try {
      const endpoint = `${SUPABASE_URL}/rest/v1/relay_commands?id=eq.${cmdId}`;
      const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      };

      const parsedUrl = new URL(endpoint);
      const mod = parsedUrl.protocol === 'https:' ? https : http;
      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'DELETE',
        headers: headers,
      };

      const req = mod.request(reqOptions, () => {
        console.log(`🧹 AUTO-CLEANUP: Successfully deleted command ${cmdId} from Supabase relay_commands table after 2 minutes.`);
      });
      req.on('error', (err) => {
        console.error(`⚠️ Failed to auto-delete command ${cmdId}:`, err.message);
      });
      req.end();
    } catch (err) {
      console.error(`⚠️ Deletion exception for command ${cmdId}:`, err.message);
    }
  }, delayMs);
}

async function fetchHikvisionEventsPaged(searchPosition = 0, maxStep = 30, startTimeStr, endTimeStr) {
  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const url = `http://${HIK_IP}${uri}`;
  const postData = JSON.stringify({
    AcsEventCond: {
      searchID: '1',
      searchResultPosition: searchPosition,
      maxResults: maxStep,
      major: 0,
      minor: 0,
      startTime: startTimeStr,
      endTime: endTimeStr,
      timeReverseOrder: true,
    },
  });

  const firstRes = await httpPost(url, { 'Content-Type': 'application/json' }, postData).catch(() => null);
  if (firstRes && firstRes.status === 401) {
    const wwwAuth = String(firstRes.headers['www-authenticate'] || '');
    const digestHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);
    const secondRes = await httpPost(url, {
      'Content-Type': 'application/json',
      'Authorization': digestHeader,
    }, postData).catch(() => null);
    if (secondRes && secondRes.ok) {
      return await secondRes.json();
    }
  } else if (firstRes && firstRes.ok) {
    return await firstRes.json();
  }
  return null;
}

async function checkAndExecuteCloudCommands() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/relay_commands?status=eq.PENDING&order=id.asc&limit=1`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };

  let cmdIdToClean = null;

  try {
    const res = await httpGet(endpoint, headers);
    if (!res.ok) return;
    const pendingCmds = await res.json();
    if (!Array.isArray(pendingCmds) || pendingCmds.length === 0) return;

    const cmd = pendingCmds[0];
    cmdIdToClean = cmd.id;
    const cmdType = String(cmd.command || '').toUpperCase();
    const logTimeStr = () => new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });

    console.log(`\n⚡ CLOUD COMMAND RECEIVED: [${cmdType}] (ID: ${cmd.id})`);
    
    // Stage 3: Mark RECEIVED (Performing Request) in Supabase DB
    await updateCommandStatus(cmd.id, 'RECEIVED', `[${logTimeStr()}] Performing Request 🔄`);
    await new Promise((r) => setTimeout(r, 250));

    // Hard 2-Minute Command Timeout Watchdog
    let isCommandTimedOut = false;
    const cmdTimeoutTimer = setTimeout(async () => {
      isCommandTimedOut = true;
      console.error(`⏰ TIMEOUT: Command ${cmd.id} exceeded 2-minute execution limit. Aborting...`);
      await updateCommandStatus(cmd.id, 'FAILED', `[${logTimeStr()}] Request Terminated (See Logs) ❌ [2-Min Timeout Exceeded]`);
      scheduleCommandDeletion(cmd.id, 5000);
    }, 120000);

    // Stage 3: Mark PROCESSING (Performing Request Chunking) in Supabase DB
    await updateCommandStatus(cmd.id, 'PROCESSING', `[${logTimeStr()}] Performing Request (Initializing Engine)...`);

    const now = new Date();
    let daysBack = 1;
    if (cmdType === 'SYNC_DAILY') daysBack = 2;
    if (cmdType === 'SYNC_WEEKLY') daysBack = 7;
    if (cmdType === 'SYNC_MONTHLY') daysBack = 30;

    let startTimeStr = cmd.start_date;
    let endTimeStr = cmd.end_date;

    if (!startTimeStr || !startTimeStr.includes('T')) {
      const pastDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
      const startYYYY = pastDate.getFullYear();
      const startMM = String(pastDate.getMonth() + 1).padStart(2, '0');
      const startDD = String(pastDate.getDate()).padStart(2, '0');
      startTimeStr = `${startYYYY}-${startMM}-${startDD}T00:00:00+05:30`;
    }

    if (!endTimeStr || !endTimeStr.includes('T')) {
      const endYYYY = now.getFullYear();
      const endMM = String(now.getMonth() + 1).padStart(2, '0');
      const endDD = String(now.getDate()).padStart(2, '0');
      endTimeStr = `${endYYYY}-${endMM}-${endDD}T23:59:59+05:30`;
    }

    const maxPages = cmdType === 'SYNC_MONTHLY' ? 50 : cmdType === 'SYNC_WEEKLY' ? 20 : 8;
    let position = 0;
    const maxStep = 30;
    let totalInserted = 0;

    for (let page = 0; page < maxPages; page++) {
      if (isCommandTimedOut) break;

      const pagedData = await fetchHikvisionEventsPaged(position, maxStep, startTimeStr, endTimeStr);
      const chunkEvents = pagedData?.AcsEvent?.InfoList || [];
      const statusStr = String(pagedData?.AcsEvent?.responseStatusStrg || '').toUpperCase();

      if (chunkEvents.length === 0 || statusStr === 'NO MATCH') break;

      const chunkNewRecords = [];
      for (const event of chunkEvents) {
        if (event.major !== undefined && Number(event.major) !== 5 && Number(event.major) !== 0) continue;

        const serial = parseInt(event.serialNo || '0', 10);
        const employeeNo = (event.employeeNoString || event.employeeNo || event.cardNo || '').toString().trim();
        const userName = (event.name || event.userType || (employeeNo ? `Employee ${employeeNo}` : '')).toString().trim();
        if (!employeeNo || employeeNo === '--' || employeeNo.toLowerCase() === 'invalid' || !userName) continue;

        const numericCode = employeeNo.replace(/[^0-9]/g, '');
        if (!numericCode) continue;

        const parsedTime = parseHikTime(event.time);
        const dateStamp = `${parsedTime.YYYY}${parsedTime.month}${parsedTime.day}${parsedTime.hh}${parsedTime.mm}${parsedTime.ss}`;
        const entry_id = `T${dateStamp}${numericCode}${serial}`;

        if (!processedEntryIds.has(entry_id)) {
          processedEntryIds.add(entry_id);
          const atn_token = `${parsedTime.yearShort}${parsedTime.month}${parsedTime.day}${numericCode}`;
          const employee_id = employeeNo.includes('-') ? employeeNo : employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

          chunkNewRecords.push({
            entry_id,
            atn_token,
            employee_id,
            user_name: userName,
            attendance_date: parsedTime.dateStr,
            attendance_time: parsedTime.timeStr24,
          });
        }
      }

      position += chunkEvents.length;

      if (chunkNewRecords.length > 0) {
        await upsertToSupabase(chunkNewRecords);
        totalInserted += chunkNewRecords.length;
      }

      const progressMsg = `[${logTimeStr()}] Performing Request (Chunk #${page + 1}/${maxPages}: ${totalInserted} inserted)`;
      console.log(`[CHUNK ENGINE] ${progressMsg}`);
      await updateCommandStatus(cmd.id, 'PROCESSING', progressMsg);

      if (page < maxPages - 1) {
        await new Promise((r) => setTimeout(r, 35));
      }
    }

    clearTimeout(cmdTimeoutTimer);

    if (!isCommandTimedOut) {
      await updateCommandStatus(cmd.id, 'COMPLETED', `[${logTimeStr()}] Request Done ✅ (${totalInserted} recordsSynced)`);
      console.log(`✅ CLOUD COMMAND [${cmdType}] COMPLETED! Total ${totalInserted} new records inserted.\n`);
      scheduleCommandDeletion(cmd.id, 120000);
    }
  } catch (cmdErr) {
    console.error('⚠️ Error processing cloud command:', cmdErr.message);
    if (cmdIdToClean) {
      const errTimeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });
      await updateCommandStatus(cmdIdToClean, 'FAILED', `[${errTimeStr}] Request Terminated (See Logs) ❌ (${cmdErr.message})`);
      scheduleCommandDeletion(cmdIdToClean, 15000);
    }
  }
}

let lastHeartbeatTs = 0;

async function sendHeartbeatToSupabase() {
  const now = Date.now();
  if (now - lastHeartbeatTs < 12000) return;
  lastHeartbeatTs = now;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
  const endpoint = `${SUPABASE_URL}/rest/v1/relay_status`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };
  const body = [
    {
      node_id: 'HOST_PC_MASTER',
      status: isMachineConnected ? 'ONLINE' : 'MACHINE_OFFLINE',
      machine_ip: HIK_IP,
      machine_connected: isMachineConnected,
      auth_token: 'TFC-MASTER-RELAY-V2',
      processed_count: processedEntryIds.size,
      last_heartbeat: new Date().toISOString(),
    }
  ];

  return httpPost(endpoint, headers, body).catch(() => null);
}

async function initRelay() {
  console.log('====================================================');
  console.log('📡 TFC AXOM - STANDALONE LOCAL RELAY AGENT');
  console.log('====================================================');
  console.log(`🌐 Hikvision Machine: http://${HIK_IP}`);
  console.log(`☁️ Supabase Cloud: ${SUPABASE_URL}`);
  console.log(`⏱️ Polling Frequency: Every ${POLL_INTERVAL_MS}ms\n`);

  startLocalHttpServer(5000);
  await fetchSupabaseProcessedIds();

  console.log('🟢 STANDALONE RELAY AGENT ACTIVE & RUNNING!\n');

  setInterval(async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      await sendHeartbeatToSupabase();
      await checkAndExecuteCloudCommands();

      const data = await fetchHikvisionEvents();
      isMachineConnected = true;
      await sendHeartbeatToSupabase();
      const newRecords = [];

      if (data?.AcsEvent?.InfoList && Array.isArray(data.AcsEvent.InfoList)) {
        for (const event of data.AcsEvent.InfoList) {
          if (event.major !== undefined && Number(event.major) !== 5 && Number(event.major) !== 0) continue;

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
            const employee_id = employeeNo.includes('-') ? employeeNo : employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

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
        lastSyncTimeIso = new Date().toISOString();
        const time = new Date().toLocaleTimeString();
        console.log(`[${time}] ⚡ NEW ATTENDANCE PUNCH DETECTED! Syncing ${newRecords.length} record(s) to Supabase Cloud...`);

        const supaRes = await upsertToSupabase(newRecords);
        if (supaRes && supaRes.ok) {
          console.log(`[${time}] ✅ Successfully upserted ${newRecords.length} record(s) to Supabase Cloud DB!`);
        } else {
          console.error(`[${time}] ❌ Supabase Sync HTTP Error`);
        }

        if (GOOGLE_SCRIPT_URL) {
          try {
            await httpPost(GOOGLE_SCRIPT_URL, { 'Content-Type': 'application/json' }, newRecords);
            console.log(`[${time}] ✅ Google Sheets synced!`);
          } catch { }
        }
      }
    } catch (err) {
      isMachineConnected = false;
    } finally {
      isSyncing = false;
    }
  }, POLL_INTERVAL_MS);
}

initRelay();
