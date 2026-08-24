import crypto from 'crypto';
import os from 'os';
import dgram from 'dgram';
import https from 'https';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedHikIp: string | null = null;
const DEFAULT_HIK_IP = process.env.HIKVISION_IP || '192.168.1.63';
const HIK_USER = process.env.HIKVISION_USER || 'admin';
const HIK_PASS = process.env.HIKVISION_PASS || 'Deepak@1509';

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_APP_SCRIPT_URL || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

export interface AttendanceRecord {
  entry_id: string;
  atn_token: string;
  employee_id: string;
  user_name: string;
  attendance_date: string;
  attendance_time: string; // Stored in 24-Hour format (e.g. 17:12:00)
  serial_no?: number;
}

export interface HikvisionDeviceInfo {
  isConnected: boolean;
  ip: string;
  model: string;
  deviceName: string;
  serialNumber: string;
  macAddress: string;
  firmwareVersion: string;
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!supabaseInstance && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseInstance;
}

// In-Memory processed entry IDs cache (No disk file writes)
const processedEntryIds = new Set<string>();

// ----------------------------------------------------
// TIME PARSER (SUPABASE 24H "17:12:00" & WEBSITE UI 12H "05:12:00 PM")
// ----------------------------------------------------

export function parseHikvisionEventTime(timeStr: string): {
  dateStr: string;
  timeStr24: string;
  timeStr12: string;
  yearShort: string;
  month: string;
  day: string;
} {
  const match = (timeStr || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const yFull = match[1];
    const month = match[2];
    const day = match[3];
    const yearShort = yFull.slice(-2);
    const dateStr = `${day}/${month}/${yFull}`; // Store DD/MM/YYYY for consistent date matching

    let h = parseInt(match[4], 10);
    const m = match[5];
    const s = match[6];

    const hh24 = String(h).padStart(2, '0');
    const timeStr24 = `${hh24}:${m}:${s}`;

    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const hStr = String(h).padStart(2, '0');
    const timeStr12 = `${hStr}:${m}:${s} ${ampm}`;

    return { dateStr, timeStr24, timeStr12, yearShort, month, day };
  }

  const d = new Date(timeStr);
  const timeStr12 = d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const timeStr24 = d.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const parts = formatter.formatToParts(d);
  let day = '01';
  let month = '01';
  let yearFull = '2026';

  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'year') yearFull = part.value;
  }

  const yearShort = yearFull.slice(-2);
  const dateStr = `${day}/${month}/${yearFull}`;

  return { dateStr, timeStr24, timeStr12, yearShort, month, day };
}

export function formatTo12Hour(timeStr: string): string {
  if (!timeStr) return '';
  if (timeStr.toUpperCase().includes('AM') || timeStr.toUpperCase().includes('PM')) {
    return timeStr;
  }
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return timeStr;
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return timeStr;
  const m = parts[1];
  const s = parts[2] ? parts[2] : '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hStr = String(h).padStart(2, '0');
  return `${hStr}:${m}:${s} ${ampm}`;
}

export function formatTo24Hour(timeStr: string): string {
  if (!timeStr) return '';
  const isPM = timeStr.toUpperCase().includes('PM');
  const isAM = timeStr.toUpperCase().includes('AM');

  if (!isPM && !isAM) return timeStr.trim();

  const clean = timeStr.replace(/AM|PM/gi, '').trim();
  const parts = clean.split(':');
  if (parts.length < 2) return timeStr;

  let h = parseInt(parts[0], 10);
  const m = parts[1];
  const s = parts[2] ? parts[2] : '00';

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  const hhStr = String(h).padStart(2, '0');
  return `${hhStr}:${m}:${s}`;
}

// ----------------------------------------------------
// AUTO-DISCOVERY & DEVICE INFO PROBE ENGINE
// ----------------------------------------------------

export function scanViaSADP(timeoutMs = 1500): Promise<string[]> {
  return new Promise((resolve) => {
    const discoveredIps: string[] = [];
    let socket: dgram.Socket | null = null;

    try {
      socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      const probePacket = Buffer.from(
        `<?xml version="1.0" encoding="utf-8"?><Probe><Types>Search</Types></Probe>`
      );

      socket.on('message', (msg, rinfo) => {
        const msgStr = msg.toString();
        const ipMatch = msgStr.match(/<IPv4Address>([^<]+)<\/IPv4Address>/i);
        const deviceIp = ipMatch ? ipMatch[1] : rinfo.address;

        if (deviceIp && !discoveredIps.includes(deviceIp)) {
          discoveredIps.push(deviceIp);
        }
      });

      socket.on('error', () => {
        if (socket) {
          try { socket.close(); } catch { }
        }
        resolve(discoveredIps);
      });

      socket.bind(() => {
        try {
          if (socket) {
            socket.setBroadcast(true);
            socket.send(probePacket, 0, probePacket.length, 37020, '239.255.255.250');
          }
        } catch {
          resolve(discoveredIps);
        }
      });
    } catch {
      resolve(discoveredIps);
    }

    setTimeout(() => {
      if (socket) {
        try { socket.close(); } catch { }
      }
      resolve(discoveredIps);
    }, timeoutMs);
  });
}

export function getLocalSubnets(): string[] {
  const interfaces = os.networkInterfaces();
  const subnets: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        if (parts.length === 4) {
          const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
          if (!subnets.includes(prefix)) {
            subnets.push(prefix);
          }
        }
      }
    }
  }

  if (subnets.length === 0) {
    subnets.push('192.168.1', '192.168.0');
  }

  return subnets;
}

async function checkIpIsHikvision(ip: string): Promise<boolean> {
  const protocol = cachedWorkingProtocol || 'http';
  const testEndpoints = [
    `${protocol}://${ip}/ISAPI/System/deviceInfo`,
    `http://${ip}/ISAPI/System/deviceInfo`,
  ];

  for (const url of testEndpoints) {
    try {
      const res = await fetchHikvisionRequest(url, { method: 'GET' }).catch(() => null);
      if (!res) continue;

      const wwwAuth = String(res.headers['www-authenticate'] || '').toLowerCase();
      const serverHeader = String(res.headers['server'] || '').toLowerCase();

      if (
        res.status === 401 ||
        res.status === 200 ||
        wwwAuth.includes('digest') ||
        serverHeader.includes('hikvision')
      ) {
        return true;
      }
    } catch {
      // Continue to next probe
    }
  }
  return false;
}

export async function discoverHikvisionDevice(forceRescan = false): Promise<{
  ip: string;
  scannedCount: number;
  subnets: string[];
  isDiscovered: boolean;
  method: 'SADP_MULTICAST' | 'HTTP_SUBNET_SCAN' | 'CACHE_FALLBACK';
}> {
  const candidateIp = cachedHikIp || DEFAULT_HIK_IP;
  const isWorking = await checkIpIsHikvision(candidateIp);
  if (isWorking) {
    cachedHikIp = candidateIp;
    return {
      ip: candidateIp,
      scannedCount: 1,
      subnets: getLocalSubnets(),
      isDiscovered: true,
      method: 'CACHE_FALLBACK',
    };
  }

  try {
    const sadpFoundIps = await scanViaSADP(1500);
    for (const sadpIp of sadpFoundIps) {
      if (await checkIpIsHikvision(sadpIp)) {
        cachedHikIp = sadpIp;
        return {
          ip: sadpIp,
          scannedCount: sadpFoundIps.length,
          subnets: getLocalSubnets(),
          isDiscovered: true,
          method: 'SADP_MULTICAST',
        };
      }
    }
  } catch (sadpErr) {
    // Fallback to HTTP subnet scan
  }

  const subnets = getLocalSubnets();
  let totalScanned = 0;

  for (const subnet of subnets) {
    const ipList: string[] = [];
    for (let i = 1; i <= 254; i++) {
      ipList.push(`${subnet}.${i}`);
    }

    const batchSize = 25;
    for (let i = 0; i < ipList.length; i += batchSize) {
      const batch = ipList.slice(i, i + batchSize);
      totalScanned += batch.length;

      const probeResults = await Promise.all(
        batch.map(async (ip) => {
          const found = await checkIpIsHikvision(ip);
          return found ? ip : null;
        })
      );

      const discoveredIp = probeResults.find((ip) => ip !== null);
      if (discoveredIp) {
        cachedHikIp = discoveredIp;
        return {
          ip: discoveredIp,
          scannedCount: totalScanned,
          subnets,
          isDiscovered: true,
          method: 'HTTP_SUBNET_SCAN',
        };
      }
    }
  }

  cachedHikIp = DEFAULT_HIK_IP;
  return {
    ip: DEFAULT_HIK_IP,
    scannedCount: totalScanned,
    subnets,
    isDiscovered: false,
    method: 'CACHE_FALLBACK',
  };
}

let cachedDeviceInfo: HikvisionDeviceInfo | null = null;
let lastDeviceInfoTs = 0;

export async function getHikvisionDeviceInfo(): Promise<HikvisionDeviceInfo> {
  const now = Date.now();
  if (cachedDeviceInfo && now - lastDeviceInfoTs < 5000) {
    return cachedDeviceInfo;
  }

  const isVercel = process.env.VERCEL === '1' || process.env.NEXT_PUBLIC_VERCEL_ENV !== undefined;
  const ip = cachedHikIp || DEFAULT_HIK_IP;

  // Helper to check if Relay Agent is active by querying Supabase Cloud DB
  const checkRelayFallback = async (): Promise<HikvisionDeviceInfo | null> => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: recentRows } = await supabase
          .from('attendance_log')
          .select('created_at')
          .order('id', { ascending: false })
          .limit(1);

        if (recentRows && recentRows.length > 0) {
          cachedDeviceInfo = {
            isConnected: true,
            ip: 'Relay Cloud Bridge',
            model: 'DS-K1T320EFWX',
            deviceName: 'Access Controller (Relay Connected)',
            serialNumber: 'RELAY-ACTIVE',
            macAddress: 'a4:d5:c2:1c:4d:83',
            firmwareVersion: 'V3.5.2 (Relay Mode)',
          };
          lastDeviceInfoTs = now;
          return cachedDeviceInfo;
        }
      } catch { }
    }
    return null;
  };

  // If running on Vercel cloud environment, skip slow local IP timeouts and check Relay status directly
  if (isVercel) {
    const relayInfo = await checkRelayFallback();
    if (relayInfo) return relayInfo;
  }

  const uri = '/ISAPI/System/deviceInfo';
  const protocol = cachedWorkingProtocol || 'http';
  const url = `${protocol}://${ip}${uri}`;

  try {
    const firstRes = await fetchHikvisionRequest(url, { method: 'GET' }).catch(() => null);

    if (!firstRes) {
      const relayInfo = await checkRelayFallback();
      if (relayInfo) return relayInfo;

      cachedDeviceInfo = {
        isConnected: false,
        ip,
        model: 'DS-K1T320EFWX',
        deviceName: 'Access Controller',
        serialNumber: '--',
        macAddress: 'a4:d5:c2:1c:4d:83',
        firmwareVersion: 'V3.5.2',
      };
      lastDeviceInfoTs = now;
      return cachedDeviceInfo;
    }

    let xmlText = '';
    if (firstRes.status === 401) {
      const wwwAuth = String(firstRes.headers['www-authenticate'] || '');
      const digestHeader = buildDigestHeader('GET', uri, wwwAuth, HIK_USER, HIK_PASS);

      const secondRes = await fetchHikvisionRequest(url, {
        method: 'GET',
        headers: { Authorization: digestHeader },
      }).catch(() => null);

      if (secondRes && secondRes.ok) {
        xmlText = await secondRes.text();
      }
    } else if (firstRes.ok) {
      xmlText = await firstRes.text();
    }

    if (firstRes) {
      const modelMatch =
        xmlText.match(/<model[^>]*>([^<]+)<\/model>/i) ||
        xmlText.match(/"model"\s*:\s*"([^"]+)"/i) ||
        xmlText.match(/<subModel[^>]*>([^<]+)<\/subModel>/i);

      const nameMatch =
        xmlText.match(/<deviceName[^>]*>([^<]+)<\/deviceName>/i) ||
        xmlText.match(/"deviceName"\s*:\s*"([^"]+)"/i);

      const serialMatch =
        xmlText.match(/<serialNumber[^>]*>([^<]+)<\/serialNumber>/i) ||
        xmlText.match(/"serialNumber"\s*:\s*"([^"]+)"/i);

      const macMatch =
        xmlText.match(/<macAddress[^>]*>([^<]+)<\/macAddress>/i) ||
        xmlText.match(/"macAddress"\s*:\s*"([^"]+)"/i);

      const fwMatch =
        xmlText.match(/<firmwareVersion[^>]*>([^<]+)<\/firmwareVersion>/i) ||
        xmlText.match(/"firmwareVersion"\s*:\s*"([^"]+)"/i);

      cachedDeviceInfo = {
        isConnected: true,
        ip,
        model: modelMatch ? modelMatch[1].trim() : 'DS-K1T320EFWX',
        deviceName: nameMatch ? nameMatch[1].trim() : 'Access Controller',
        serialNumber: serialMatch ? serialMatch[1].trim() : '--',
        macAddress: macMatch ? macMatch[1].trim() : 'a4:d5:c2:1c:4d:83',
        firmwareVersion: fwMatch ? fwMatch[1].trim() : 'V3.5.2',
      };
      lastDeviceInfoTs = now;
      return cachedDeviceInfo;
    }
  } catch (err) { }

  const relayInfo = await checkRelayFallback();
  if (relayInfo) return relayInfo;

  cachedDeviceInfo = {
    isConnected: false,
    ip,
    model: 'DS-K1T320EFWX',
    deviceName: 'Access Controller',
    serialNumber: '--',
    macAddress: 'a4:d5:c2:1c:4d:83',
    firmwareVersion: 'V3.5.2',
  };
  lastDeviceInfoTs = now;
  return cachedDeviceInfo;
}

// ----------------------------------------------------
// DIGEST AUTHENTICATION & HIKVISION REQUESTS
// ----------------------------------------------------

function buildDigestHeader(
  method: string,
  uri: string,
  wwwAuthHeader: string,
  user: string,
  pass: string
): string {
  const realmMatch = wwwAuthHeader.match(/realm="([^"]+)"/i);
  const nonceMatch = wwwAuthHeader.match(/nonce="([^"]+)"/i);
  const qopMatch = wwwAuthHeader.match(/qop="([^"]+)"/i);
  const opaqueMatch = wwwAuthHeader.match(/opaque="([^"]+)"/i);

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

let cachedWorkingProtocol: 'http' | 'https' | null = null;

function fetchHikvisionRequest(
  urlStr: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: any; ok: boolean; json: () => Promise<any>; text: () => Promise<string> }> {
  const parsedUrl = new URL(urlStr);
  const pathWithSearch = parsedUrl.pathname + parsedUrl.search;
  const postData = options.body || '';

  const tryTransport = (isHttps: boolean): Promise<any> => {
    return new Promise((resolve, reject) => {
      const mod: any = isHttps ? https : require('http');
      const reqOptions: any = {
        hostname: parsedUrl.hostname,
        port: isHttps ? (parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443) : (parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80),
        path: pathWithSearch,
        method: options.method || 'GET',
        headers: {
          ...(options.headers || {}),
          'Content-Length': String(Buffer.byteLength(postData)),
        },
        rejectUnauthorized: false,
      };

      const reqStart = Date.now();
      const req = mod.request(reqOptions, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => { data += chunk; });
        res.on('end', () => {
          const duration = Date.now() - reqStart;
          console.log(`[API_CONNECTION_CLOSED] Server ISAPI Call -> Method: ${options.method || 'GET'} | Path: ${pathWithSearch} | Status: ${res.statusCode} | Duration: ${duration}ms`);
          resolve({
            status: res.statusCode || 500,
            headers: res.headers,
            ok: !!(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            text: () => Promise.resolve(data),
            json: () => Promise.resolve(JSON.parse(data || '{}')),
          });
        });
      });

      req.setTimeout(2000, () => {
        req.destroy(new Error(`Hikvision connection timeout (2000ms on ${isHttps ? 'HTTPS' : 'HTTP'})`));
      });

      req.on('error', (err: any) => {
        const duration = Date.now() - reqStart;
        console.error(`[API_CONNECTION_CLOSED_WITH_ERROR] Server ISAPI Call -> Path: ${pathWithSearch} | Error: ${err.message} | Duration: ${duration}ms`);
        reject(err);
      });
      if (postData) req.write(postData);
      req.end();
    });
  };

  if (cachedWorkingProtocol === 'http') {
    return tryTransport(false).catch(() => {
      cachedWorkingProtocol = null;
      return tryTransport(true);
    });
  }

  if (cachedWorkingProtocol === 'https') {
    return tryTransport(true).catch(() => {
      cachedWorkingProtocol = null;
      return tryTransport(false);
    });
  }

  // Try HTTP first (standard for Hikvision biometric terminals), fallback to HTTPS
  return tryTransport(false)
    .then((res) => {
      cachedWorkingProtocol = 'http';
      return res;
    })
    .catch(() => {
      return tryTransport(true).then((res) => {
        cachedWorkingProtocol = 'https';
        return res;
      });
    });
}

export async function fetchHikvisionEvents(deep: boolean = false): Promise<{ data: any; deviceIp: string }> {
  const discovery = await discoverHikvisionDevice(false);
  const hikIp = discovery.ip;

  const uri = '/ISAPI/AccessControl/AcsEvent?format=json';
  const protocol = cachedWorkingProtocol || 'http';
  const url = `${protocol}://${hikIp}${uri}`;

  const now = new Date();
  const daysBack = deep ? 30 : 3;
  const pastDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const startYYYY = pastDate.getFullYear();
  const startMM = String(pastDate.getMonth() + 1).padStart(2, '0');
  const startDD = String(pastDate.getDate()).padStart(2, '0');
  const startTime = `${startYYYY}-${startMM}-${startDD}T00:00:00+05:30`;

  const endYYYY = now.getFullYear();
  const endMM = String(now.getMonth() + 1).padStart(2, '0');
  const endDD = String(now.getDate()).padStart(2, '0');
  const endTime = `${endYYYY}-${endMM}-${endDD}T23:59:59+05:30`;

  // Realtime fast mode: 1 page (30 results); Deep mode: 12 pages (360+ results) with cached auth & pacing
  let allInfoList: any[] = [];
  let position = 0;
  const maxStep = 30;
  const maxPages = deep ? 12 : 1;
  let cachedAuthHeader: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const postData = JSON.stringify({
      AcsEventCond: {
        searchID: String(page + 1),
        searchResultPosition: position,
        maxResults: maxStep,
        major: 0,
        minor: 0,
        startTime: startTime,
        endTime: endTime,
        timeReverseOrder: true,
      },
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cachedAuthHeader) {
      headers['Authorization'] = cachedAuthHeader;
    }

    let firstRes = await fetchHikvisionRequest(url, {
      method: 'POST',
      headers,
      body: postData,
    });

    let resData: any = null;

    if (firstRes.status === 401) {
      const wwwAuth = String(firstRes.headers['www-authenticate'] || '');
      cachedAuthHeader = buildDigestHeader('POST', uri, wwwAuth, HIK_USER, HIK_PASS);
      headers['Authorization'] = cachedAuthHeader;

      const secondRes = await fetchHikvisionRequest(url, {
        method: 'POST',
        headers,
        body: postData,
      });

      if (secondRes.ok) {
        resData = await secondRes.json();
      }
    } else if (firstRes.ok) {
      resData = await firstRes.json();
    }

    const acsObj = resData?.AcsEvent;
    const chunk = acsObj?.InfoList || [];
    const statusStr = String(acsObj?.responseStatusStrg || '').toUpperCase();

    if (chunk.length === 0 || statusStr === 'NO MATCH') break;

    allInfoList = allInfoList.concat(chunk);
    position += chunk.length;

    console.log(`[HIKVISION ISAPI] Page #${page + 1}/${maxPages}: Fetched ${chunk.length} items (Total Accumulated: ${allInfoList.length}) | Status: ${statusStr || 'OK'}`);

    // Small 35ms pacing pause between pages to keep microcontroller webserver socket buffer cool
    if (page < maxPages - 1) {
      await new Promise((r) => setTimeout(r, 35));
    }
  }

  return {
    data: {
      AcsEvent: {
        InfoList: allInfoList,
      },
    },
    deviceIp: hikIp,
  };
}

// ----------------------------------------------------
// REALTIME DIRECT MACHINE TO SUPABASE CLOUD & SHEETS SYNC
// ----------------------------------------------------

export async function syncHikvisionAttendance(deep: boolean = false) {
  try {
    const deviceInfo = await getHikvisionDeviceInfo();
    if (!deviceInfo.isConnected) {
      return {
        success: false,
        isConnected: false,
        error: 'Machine is offline / disconnected. Machine API calls paused.',
        processed: 0,
        deviceIp: deviceInfo.ip,
        deviceInfo,
      };
    }

    const supabase = getSupabaseClient();

    // Populate in-memory set from Supabase or reset if DB was truncated
    if (supabase) {
      try {
        const { data: supaRows } = await supabase
          .from('attendance_log')
          .select('entry_id')
          .order('id', { ascending: false })
          .limit(2000);
        if (supaRows) {
          if (supaRows.length === 0 && processedEntryIds.size > 0) {
            processedEntryIds.clear();
          } else {
            supaRows.forEach((r) => processedEntryIds.add(r.entry_id));
          }
        }
      } catch { }
    }

    let maxSerial = 0;
    const newRecords: AttendanceRecord[] = [];
    const allFetchedMachineRecords: AttendanceRecord[] = [];

    let fetchResult;
    try {
      fetchResult = await fetchHikvisionEvents(deep);
    } catch (err: any) {
      console.error('Hikvision fetch error:', err.message);
      return {
        success: false,
        error: err.message,
        processed: 0,
        deviceIp: cachedHikIp || DEFAULT_HIK_IP,
      };
    }

    const { data, deviceIp } = fetchResult;

    if (data?.AcsEvent?.InfoList && Array.isArray(data.AcsEvent.InfoList)) {
      for (const event of data.AcsEvent.InfoList) {
        const serial = parseInt(event.serialNo || '0', 10);
        if (serial > maxSerial) {
          maxSerial = serial;
        }

        if (event.major !== undefined && Number(event.major) !== 5 && Number(event.major) !== 0) continue;

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

        if (
          !employeeNo ||
          employeeNo === '--' ||
          employeeNo.toLowerCase() === 'invalid' ||
          !userName
        ) {
          continue;
        }

        const numericCode = employeeNo.replace(/[^0-9]/g, '');
        if (!numericCode) continue;

        const parsedTime = parseHikvisionEventTime(event.time);
        const attendance_date = parsedTime.dateStr;
        const attendance_time = parsedTime.timeStr24;

        const YYYY = new Date(event.time).getFullYear();
        const MM = parsedTime.month;
        const DD = parsedTime.day;
        const hh = String(new Date(event.time).getHours()).padStart(2, '0');
        const mm = String(new Date(event.time).getMinutes()).padStart(2, '0');
        const ss = String(new Date(event.time).getSeconds()).padStart(2, '0');
        const dateStamp = `${YYYY}${MM}${DD}${hh}${mm}${ss}`;

        const entry_id = `T${dateStamp}${numericCode}${serial}`;

        const atn_token = `${parsedTime.yearShort}${parsedTime.month}${parsedTime.day}${numericCode}`;
        const employee_id = employeeNo.includes('-') ? employeeNo : employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

        const formattedRec: AttendanceRecord = {
          entry_id,
          atn_token,
          employee_id,
          user_name: userName,
          attendance_date,
          attendance_time,
          serial_no: serial,
        };

        allFetchedMachineRecords.push(formattedRec);

        if (!processedEntryIds.has(entry_id)) {
          processedEntryIds.add(entry_id);
          newRecords.push(formattedRec);
        }
      }
    }

    if (newRecords.length > 0) {
      console.log(`⚡ GHOST SYNC: DETECTED ${newRecords.length} NEW PUNCH(ES) FROM MACHINE! Updating Supabase Cloud DB in background...`);

      // Ghost Sync: Background Insert into Supabase Cloud Table
      if (supabase) {
        try {
          const supaPayload = newRecords.map((r) => ({
            entry_id: r.entry_id,
            atn_token: r.atn_token,
            employee_id: r.employee_id,
            user_name: r.user_name,
            attendance_date: r.attendance_date,
            attendance_time: r.attendance_time,
          }));

          const { error: sErr } = await supabase
            .from('attendance_log')
            .upsert(supaPayload, { onConflict: 'entry_id' });
          if (sErr) {
            console.error('Supabase Ghost Sync error:', sErr.message);
          } else {
            console.log(`✅ Supabase Cloud Ghost-Synced ${newRecords.length} record(s) on entry_id!`);
          }

          // Auto-onboard new employees in public.employees
          const uniqueEmpsMap = new Map<string, string>();
          newRecords.forEach((r) => {
            if (r.employee_id) {
              uniqueEmpsMap.set(r.employee_id, r.user_name || r.employee_id);
            }
          });

          if (uniqueEmpsMap.size > 0) {
            const empUpsertPayload = Array.from(uniqueEmpsMap.entries()).map(([empId, empName]) => ({
              employeeId: empId,
              employeeName: empName,
              employeeType: 'BIOMETRIC',
              is_active: true,
              updated_at: new Date().toISOString(),
            }));

            for (const emp of empUpsertPayload) {
              await supabase
                .from('employees')
                .upsert(emp, { onConflict: 'employeeId', ignoreDuplicates: true });
            }
          }
        } catch (sErr: any) {
          console.error('Supabase insert exception:', sErr.message);
        }
      }

      // Direct Sync to Google Sheets
      if (GOOGLE_SCRIPT_URL) {
        try {
          await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRecords),
          });
        } catch {}
      }
    }

    console.log(`[HIKVISION SYNC COMPLETE] Mode: ${deep ? 'DEEP' : 'FAST'} | Total Records: ${allFetchedMachineRecords.length} | New Punches: ${newRecords.length}`);

    return {
      success: true,
      isConnected: true,
      records: allFetchedMachineRecords,
      newRecordsInserted: newRecords.length,
      lastSerial: maxSerial,
      deviceIp,
      deviceInfo,
    };
  } catch (error: any) {
    console.error('Sync process error:', error);
    return { success: false, error: error.message };
  }
}
