'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Terminal,
  RotateCw,
  Search,
  Database,
  Wifi,
  Clock,
  ShieldCheck,
  Radar,
  FileCode,
  Users,
  ListFilter,
  LogIn,
  LogOut,
  Trash2,
  Cpu,
  Sun,
  Moon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown
} from 'lucide-react';

interface RecordItem {
  entry_id: string;
  atn_token: string;
  employee_id: string;
  user_name: string;
  attendance_date: string;
  attendance_time: string;
  serial_no: number;
}

interface GroupedAttendance {
  employee_id: string;
  user_name: string;
  attendance_date: string;
  check_in_time: string;
  check_out_time: string;
  total_punches: number;
  latest_punch_seconds: number;
}

interface DeviceInfoState {
  isConnected: boolean;
  ip: string;
  model: string;
  deviceName: string;
  serialNumber: string;
  macAddress: string;
  firmwareVersion: string;
}

export default function TerminalDashboard() {
  const [allRecords, setAllRecords] = useState<RecordItem[]>([]);
  const [todayRecordsList, setTodayRecordsList] = useState<RecordItem[]>([]);
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'ALL' | 'CUSTOM'>('TODAY');
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD}`;
  });
  const [endDate, setEndDate] = useState<string | null>(null);
  const [isPickingRangeEnd, setIsPickingRangeEnd] = useState<boolean>(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());

  const handleShiftDay = (deltaDays: number) => {
    const parts = startDate.split('-').map(Number);
    if (parts.length !== 3) return;
    const [y, m, d] = parts;
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + deltaDays);
    const newY = dateObj.getFullYear();
    const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const newD = String(dateObj.getDate()).padStart(2, '0');
    setLoading(true);
    setStartDate(`${newY}-${newM}-${newD}`);
    setEndDate(null);
    setIsPickingRangeEnd(false);
  };

  const formatSingleDateLabel = (isoStr: string) => {
    const parts = isoStr.split('-').map(Number);
    if (parts.length !== 3) return isoStr;
    const [y, m, d] = parts;
    const dateObj = new Date(y, m - 1, d);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${d} ${months[dateObj.getMonth()]} ${y}`;
  };

  const formatCustomDateLabel = (startIso: string, endIso?: string | null) => {
    if (!endIso || startIso === endIso) {
      return formatSingleDateLabel(startIso);
    }
    const minIso = startIso < endIso ? startIso : endIso;
    const maxIso = startIso > endIso ? startIso : endIso;
    return `${formatSingleDateLabel(minIso)} ➔ ${formatSingleDateLabel(maxIso)}`;
  };

  const handleDateCellClick = (isoDateStr: string) => {
    if (!isPickingRangeEnd || !startDate) {
      setStartDate(isoDateStr);
      setEndDate(null);
      setIsPickingRangeEnd(true);
    } else {
      setLoading(true);
      if (isoDateStr < startDate) {
        setEndDate(startDate);
        setStartDate(isoDateStr);
      } else {
        setEndDate(isoDateStr);
      }
      setIsPickingRangeEnd(false);
      setIsCalendarOpen(false);
    }
  };

  const setPresetDate = (preset: 'TODAY' | 'YESTERDAY' | 'LAST7DAYS') => {
    const d = new Date();
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const todayIso = `${YYYY}-${MM}-${DD}`;

    setLoading(true);
    setIsPickingRangeEnd(false);

    if (preset === 'YESTERDAY') {
      d.setDate(d.getDate() - 1);
      const yY = d.getFullYear();
      const yM = String(d.getMonth() + 1).padStart(2, '0');
      const yD = String(d.getDate()).padStart(2, '0');
      setStartDate(`${yY}-${yM}-${yD}`);
      setEndDate(null);
      setCalendarYear(yY);
      setCalendarMonth(d.getMonth());
    } else if (preset === 'LAST7DAYS') {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 6);
      const sY = d7.getFullYear();
      const sM = String(d7.getMonth() + 1).padStart(2, '0');
      const sD = String(d7.getDate()).padStart(2, '0');
      setStartDate(`${sY}-${sM}-${sD}`);
      setEndDate(todayIso);
      setCalendarYear(YYYY);
      setCalendarMonth(d.getMonth());
    } else {
      setStartDate(todayIso);
      setEndDate(null);
      setCalendarYear(YYYY);
      setCalendarMonth(d.getMonth());
    }
    setIsCalendarOpen(false);
  };
  
  const [total, setTotal] = useState<number>(0);
  const [todayDate, setTodayDate] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [deviceIp, setDeviceIp] = useState<string>('192.168.1.63');
  const [lastSyncTime, setLastSyncTime] = useState<string>('00:00:00');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [isAutoPoll, setIsAutoPoll] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'SUMMARY' | 'RAW'>('SUMMARY');
  const [theme, setTheme] = useState<'DARK' | 'LIGHT'>('DARK');

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoState | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);

  const prevCountRef = useRef<number>(0);

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 100)]);
  }, []);

  // Browser Client-Side Direct LAN Probe for Vercel Deployments
  const checkBrowserDirectConnection = useCallback(async (targetIp: string) => {
    try {
      addLog(`PROBE: Testing browser direct HTTP ping to http://${targetIp}/ISAPI/System/deviceInfo...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`http://${targetIp}/ISAPI/System/deviceInfo`, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res) {
        addLog(`SUCCESS: Browser direct Wi-Fi response received from http://${targetIp}!`);
        setDeviceInfo({
          isConnected: true,
          ip: targetIp,
          model: 'DS-K1T320EFWX',
          deviceName: 'Access Controller',
          serialNumber: '--',
          macAddress: 'a4:d5:c2:1c:4d:83',
          firmwareVersion: 'V3.5.2',
        });
        return true;
      }
    } catch {}
    return false;
  }, [addLog]);

  const fetchAttendanceData = useCallback(async () => {
    try {
      const url = endDate && endDate !== startDate
        ? `/api/attendance?startDate=${startDate}&endDate=${endDate}`
        : `/api/attendance?date=${startDate}`;
      
      const label = formatCustomDateLabel(startDate, endDate);
      addLog(`FETCH: Requesting ${url} from Supabase Cloud...`);
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const fetchedAll = data.records || [];
          const fetchedToday = data.todayRecords || [];
          const newTotal = fetchedAll.length || 0;

          if (prevCountRef.current > 0 && newTotal > prevCountRef.current) {
            const diff = newTotal - prevCountRef.current;
            const topRecord = fetchedAll[0];
            const name = topRecord ? topRecord.user_name : 'Employee';
            const time = topRecord ? topRecord.attendance_time : '';
            addLog(`⚡ REALTIME AUTO PUNCH DETECTED: +${diff} New Punch(es)! [${name}] at ${time}`);
          }
          prevCountRef.current = newTotal;

          if (data.deviceInfo) {
            setDeviceInfo(data.deviceInfo);
            if (data.deviceInfo.ip) setDeviceIp(data.deviceInfo.ip);

            if (data.deviceInfo.isConnected) {
              addLog(`DEVICE_STATUS: Connected [IP: ${data.deviceInfo.ip}, Model: ${data.deviceInfo.model || 'DS-K1T320EFWX'}]`);
            } else {
              addLog(`DEVICE_STATUS: Offline/Unreachable at IP ${data.deviceInfo.ip || deviceIp}. Probing browser direct LAN...`);
              const directConnected = await checkBrowserDirectConnection(data.deviceInfo.ip || deviceIp);
              if (directConnected) {
                addLog(`NETWORK: Local Wi-Fi browser bridge established with machine at ${data.deviceInfo.ip || deviceIp}!`);
              }
            }
          }

          setAllRecords(fetchedAll);
          setTodayRecordsList(fetchedToday);
          setTotal(newTotal);
          setTodayDate(data.todayDate || new Date().toLocaleDateString('en-GB'));
          
          addLog(`SYNC_OK: Fetched ${newTotal} record(s) for [${label}].`);
        } else {
          addLog(`WARN: API returned success=false - ${data.error || 'Unknown error'}`);
        }
      } else {
        addLog(`ERROR: HTTP ${res.status} returned from /api/attendance`);
      }
    } catch (err: any) {
      addLog(`ERROR: Failed to fetch attendance data - ${err.message}`);
      checkBrowserDirectConnection(deviceIp);
    } finally {
      setLoading(false);
      setIsCheckingStatus(false);
    }
  }, [addLog, checkBrowserDirectConnection, deviceIp, startDate, endDate]);

  const triggerManualSync = async () => {
    setIsSyncing(true);
    addLog(`EXEC: Triggering manual device sync command -> ./hikvision_sync --device=${deviceIp}...`);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.deviceIp) setDeviceIp(data.deviceIp);
        const count = data.newRecordsInserted || 0;
        const maxS = data.lastSerial || 0;
        addLog(`SUCCESS: Sync complete on IP ${data.deviceIp || deviceIp}. Inserted ${count} new record(s). Max Serial: #${maxS}`);
        setLastSyncTime(new Date().toLocaleTimeString());
        await fetchAttendanceData();
      } else {
        addLog(`ERROR: Device sync API returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      addLog(`FATAL: Device sync exception - ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const scanLocalNetwork = async () => {
    setIsScanning(true);
    addLog(`SCANNING: Executing SADP UDP multicast & subnet discovery scan...`);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          setDeviceIp(data.ip);
          if (data.isDiscovered) {
            addLog(`SUCCESS: Discovered Hikvision machine on IP ${data.ip} (Scanned ${data.scannedCount} addresses)`);
          } else {
            addLog(`WARN: No new response from scan. Using default IP: ${data.ip}`);
          }
        }
      } else {
        addLog(`ERROR: Network scan API returned HTTP ${res.status}`);
      }
    } catch (err: any) {
      addLog(`ERROR: Network scan failed - ${err.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val.trim()) {
      addLog(`SEARCH: Filtering records with query "${val}"...`);
    }
  };

  const handleViewModeChange = (mode: 'SUMMARY' | 'RAW') => {
    setViewMode(mode);
    addLog(`UI_LAYOUT: Switched table view mode to [${mode}]`);
  };

  const handleDateFilterChange = (filter: 'TODAY' | 'ALL' | 'CUSTOM', dateVal?: string) => {
    setDateFilter(filter);
    if (dateVal) {
      setStartDate(dateVal);
      setEndDate(null);
    }
    addLog(`DATE_FILTER: Switched filter to [${filter}${dateVal ? `: ${dateVal}` : ''}]`);
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === 'LIGHT' ? 'DARK' : 'LIGHT';
    setTheme(nextTheme);
    addLog(`THEME: Visual interface switched to [${nextTheme}_MODE]`);
  };

  const handleAutoPollToggle = () => {
    const nextState = !isAutoPoll;
    setIsAutoPoll(nextState);
    addLog(`DAEMON: Auto-polling loop toggled [${nextState ? 'ACTIVE' : 'PAUSED'}]`);
  };

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour12: true,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Status check timeout safety (15.0s timer limit)
  useEffect(() => {
    const timeoutTimer = setTimeout(() => {
      setIsCheckingStatus((prev) => {
        if (prev) {
          addLog(`WARN: Device status probe timer reached 15 sec limit. Setting fallback status.`);
        }
        return false;
      });
    }, 15000);

    return () => clearTimeout(timeoutTimer);
  }, [addLog]);

  // Initial Load Status Check
  useEffect(() => {
    addLog(`INIT: Axom Biometric Monitor Daemon v2.5 initialized.`);
    addLog(`CONFIG: Supabase Cloud DB & Hikvision ISAPI Digest driver loaded.`);
    addLog(`NETWORK: Target device IP set to ${deviceIp}. Probing connection...`);
    fetchAttendanceData();
    setLastSyncTime(new Date().toLocaleTimeString());
  }, [fetchAttendanceData, addLog, deviceIp]);

  // Dynamic Auto Polling & Offline Auto-Scan Engine (2s Online Polling, 10s Offline Scanning)
  useEffect(() => {
    let interval: any;

    if (!isCheckingStatus && isAutoPoll) {
      const isOnline = deviceInfo && deviceInfo.isConnected;

      if (isOnline) {
        addLog(`POLLING_HEARTBEAT: Machine connected [${deviceInfo.ip}]. Polling active (every 2.0s).`);
        interval = setInterval(() => {
          addLog(`TICK: 2.0s poll tick triggered.`);
          fetchAttendanceData();
        }, 2000);
      } else {
        const targetIp = deviceInfo?.ip || deviceIp;
        addLog(`OFFLINE_SCAN: Machine offline [${targetIp}]. Auto-scanning network every 10.0s for reconnection...`);

        interval = setInterval(async () => {
          addLog(`OFFLINE_RETRY: Probing machine [${targetIp}] (10.0s scan tick)...`);
          try {
            fetch('/api/scan').catch(() => null);
          } catch {}
          fetchAttendanceData();
        }, 10000);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCheckingStatus, deviceInfo, isAutoPoll, fetchAttendanceData, addLog, deviceIp]);

  const isRecordMatchingDate = (recordDateStr: string, targetIso: string) => {
    if (!recordDateStr) return false;
    const clean = recordDateStr.trim();
    const parts = targetIso.split('-');
    if (parts.length !== 3) return clean === targetIso;
    const [y, m, d] = parts;
    const shortY = y.slice(-2);

    const matchShort = `${d}/${m}/${shortY}`;
    const matchFull = `${d}/${m}/${y}`;

    return clean === targetIso || clean === matchShort || clean === matchFull;
  };

  const todayIso = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const isRecordMatchingRange = (recordDateStr: string, startIso: string, endIso?: string | null) => {
    if (!recordDateStr) return false;
    const clean = recordDateStr.trim();
    if (!endIso || startIso === endIso) {
      return isRecordMatchingDate(clean, startIso);
    }
    let recIso = clean;
    if (clean.includes('/')) {
      const parts = clean.split('/');
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y.length === 2) y = `20${y}`;
        recIso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }
    const minIso = startIso < endIso ? startIso : endIso;
    const maxIso = startIso > endIso ? startIso : endIso;
    return recIso >= minIso && recIso <= maxIso;
  };

  // Active records filtered by Date / Date Range
  const activeSourceRecords = allRecords.filter((r) => isRecordMatchingRange(r.attendance_date, startDate, endDate));

  const filteredRecords = activeSourceRecords.filter(
    (item) =>
      item.user_name.toLowerCase().includes(search.toLowerCase()) ||
      item.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      item.atn_token.toLowerCase().includes(search.toLowerCase()) ||
      item.entry_id.toLowerCase().includes(search.toLowerCase())
  );

  // Helper to parse punch time into seconds of day for accurate chronological sorting
  const getPunchSecondsOfDay = (item: RecordItem): number => {
    // 1. Check entry_id format e.g. T20260821104023...
    if (item.entry_id) {
      const match = item.entry_id.match(/^T\d{8}(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const hh = parseInt(match[1], 10);
        const mm = parseInt(match[2], 10);
        const ss = parseInt(match[3], 10);
        return hh * 3600 + mm * 60 + ss;
      }
    }

    // 2. Parse attendance_time string e.g. "10:40:23 AM", "06:35:47 PM", "18:35:47"
    if (item.attendance_time) {
      const timeStr = item.attendance_time.trim();
      const isPM = /pm/i.test(timeStr);
      const isAM = /am/i.test(timeStr);
      const cleanTime = timeStr.replace(/(am|pm)/i, '').trim();
      const parts = cleanTime.split(':').map((p) => parseInt(p, 10) || 0);

      let h = parts[0] || 0;
      const m = parts[1] || 0;
      const s = parts[2] || 0;

      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;

      return h * 3600 + m * 60 + s;
    }

    return item.serial_no || 0;
  };

  // Group records by Employee ID & Date -> First punch (earliest time) = Check In, Last punch (latest time) = Check Out
  const getGroupedAttendance = (): GroupedAttendance[] => {
    const map = new Map<string, RecordItem[]>();

    for (const item of filteredRecords) {
      const key = `${item.employee_id}_${item.attendance_date}`;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }

    const grouped: GroupedAttendance[] = [];

    Array.from(map.values()).forEach((list) => {
      // Sort chronologically ascending (earliest punch first, latest punch last)
      const sorted = [...list].sort((a, b) => getPunchSecondsOfDay(a) - getPunchSecondsOfDay(b));

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const check_in_time = first.attendance_time;
      const check_out_time = sorted.length > 1 ? last.attendance_time : '--';
      const latest_punch_seconds = getPunchSecondsOfDay(last);

      grouped.push({
        employee_id: first.employee_id,
        user_name: first.user_name,
        attendance_date: first.attendance_date,
        check_in_time,
        check_out_time,
        total_punches: sorted.length,
        latest_punch_seconds,
      });
    });

    // Sort descending by latest_punch_seconds so latest updated entries appear at TOP
    return grouped.sort((a, b) => b.latest_punch_seconds - a.latest_punch_seconds);
  };

  const groupedList = getGroupedAttendance();

  const isLight = theme === 'LIGHT';

  return (
    <div className={`min-h-screen p-2 sm:p-4 md:p-6 font-mono transition-colors duration-300 selection:bg-emerald-500 selection:text-black ${
      isLight ? 'bg-white text-slate-900' : 'bg-[#05080f] text-sky-400'
    }`}>
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Terminal Main Container Window */}
        <div className={`terminal-window rounded-lg border-2 overflow-hidden transition-colors duration-300 ${
          isLight
            ? 'bg-white border-2 border-black shadow-xl'
            : 'bg-[#090d16]/95 border-slate-700/80 shadow-2xl shadow-sky-500/10'
        }`}>
          
          {/* Terminal Window Header Bar */}
          <div className={`terminal-header px-4 py-2.5 border-b-2 flex items-center justify-between transition-colors ${
            isLight ? 'bg-white border-b-2 border-black text-slate-900' : 'bg-[#0f172a] border-slate-700 text-slate-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/90 inline-block shadow-sm shadow-red-500/50"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500/90 inline-block shadow-sm shadow-yellow-500/50"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block shadow-sm shadow-emerald-500/50"></span>
              <span className={`ml-2 text-xs font-bold flex items-center gap-1.5 ${
                isLight ? 'text-slate-900' : 'text-slate-300'
              }`}>
                <Terminal className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-500'}`} />
                root@tfc-biometric-monitor: /srv/www/tfc-biometric-monitor (bash)
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              {isCheckingStatus ? (
                <span className={`hidden sm:inline-flex items-center gap-1.5 font-bold px-2.5 py-0.5 rounded border-2 shadow-sm ${
                  isLight ? 'bg-white text-amber-600 border-black' : 'text-amber-400 bg-amber-950/80 border-amber-700/80 shadow-amber-500/20'
                }`}>
                  <RotateCw className={`w-3 h-3 animate-spin ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                  FETCHING DEVICE STATUS...
                </span>
              ) : deviceInfo && deviceInfo.isConnected ? (
                <span className={`hidden sm:inline-flex items-center gap-1.5 font-bold px-2.5 py-0.5 rounded border-2 shadow-sm ${
                  isLight ? 'bg-white text-emerald-600 border-black' : 'text-emerald-400 bg-emerald-950/80 border-emerald-700/80 shadow-emerald-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full animate-ping ${isLight ? 'bg-emerald-600' : 'bg-emerald-400'}`}></span>
                  MACHINE CONNECTED [{deviceInfo.model || 'DS-K1T320EFWX'}]
                </span>
              ) : (
                <span className={`hidden sm:inline-flex items-center gap-1.5 font-bold px-2.5 py-0.5 rounded border-2 shadow-sm ${
                  isLight ? 'bg-white text-red-600 border-black' : 'text-red-400 bg-red-950/80 border-red-700/80 shadow-red-500/20'
                }`}>
                  <span className={`w-2 h-2 rounded-full animate-ping ${isLight ? 'bg-red-600' : 'bg-red-500'}`}></span>
                  MACHINE OFFLINE [{deviceIp}]
                </span>
              )}
              
              <span className={isLight ? 'text-black font-bold' : 'text-slate-600'}>|</span>
              <span className={isLight ? 'text-slate-900 font-bold' : 'text-slate-400'}>TTY1</span>
              
              <span className={isLight ? 'text-black font-bold' : 'text-slate-600'}>|</span>
              
              {/* Interactive Toggle Switch Slider Component */}
              <div 
                className="flex items-center gap-2 cursor-pointer select-none group" 
                onClick={handleThemeToggle}
                title="Toggle Light / Dark Theme"
              >
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-900' : 'text-slate-400'}`}>
                  {isLight ? 'LIGHT' : 'DARK'}
                </span>
                <div
                  role="switch"
                  aria-checked={isLight}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-300 ease-in-out ${
                    isLight ? 'bg-amber-100 border-black' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-md transition duration-300 ease-in-out flex items-center justify-center ${
                      isLight
                        ? 'translate-x-5 bg-white border border-black text-amber-500'
                        : 'translate-x-0 bg-slate-950 border border-slate-700 text-sky-400'
                    }`}
                  >
                    {isLight ? (
                      <Sun className="w-3 h-3 text-amber-500" />
                    ) : (
                      <Moon className="w-3 h-3 text-sky-400" />
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ASCII Banner & System Specs */}
          <div className="p-4 sm:p-6 space-y-5">
            <pre className={`text-[9px] sm:text-[11px] leading-tight font-mono hidden sm:block overflow-x-auto select-none border-2 p-2.5 rounded ${
              isLight
                ? 'bg-white text-emerald-600 border-black font-bold'
                : 'bg-[#060a12] text-emerald-400/90 border-slate-800'
            }`}>
{`  _____ _____ ____   ____ ___  __  __ _____ _____ ____ ___ ____   __  __  ___  _  _____ _____ ___  ____  
 |_   _|  ___/ ___| | __ ) _ \\|  \\/  | ____|_   _|  _ |_ _/ ___| |  \\/  |/ _ \\| |/ /_ _|_   _/ _ \\|  _ \\ 
   | | | |_ | |     |  _ \\ | | | |\\/| |  _|   | | | |_) | | |     | |\\/| | | | | ' / | |  | || | | | |_) |
   | | |  _|| |___  | |_) | |_| | |  | | |___  | | |  _ <| | |___  | |  | | |_| | . \\ | |  | || |_| |  _ < 
   |_| |_|   \\____| |____/\\___/|_|  |_|_____| |_| |_| \\_\\___\\____| |_|  |_|\\___/|_|\\_\\___| |_| \\___/|_| \\_\\`}
            </pre>

            <div className={`flex flex-wrap items-center justify-between gap-2 border-y-2 py-2.5 text-xs px-3 rounded ${
              isLight
                ? 'bg-white border-black text-slate-900 font-bold'
                : 'bg-[#0b101c] border-slate-700/80 text-slate-300'
            }`}>
              <div className="flex flex-wrap items-center gap-4">
                <span className={`font-bold flex items-center gap-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  <ShieldCheck className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} /> MODEL: {deviceInfo?.model || 'DS-K1T320EFWX'}
                </span>
                <span className={isLight ? 'text-black font-bold' : 'text-slate-600'}>::</span>
                <span className={`font-bold flex items-center gap-1 ${isLight ? 'text-sky-600' : 'text-sky-300'}`}>
                  <Wifi className={`w-3.5 h-3.5 animate-pulse ${isLight ? 'text-sky-600' : 'text-sky-400'}`} /> IP: {deviceIp} (MAC: {deviceInfo?.macAddress || 'a4:d5:c2:1c:4d:83'})
                </span>
                <span className={isLight ? 'text-black font-bold' : 'text-slate-600'}>::</span>
                <span className={`font-bold flex items-center gap-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>
                  <Cpu className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} /> FW: {deviceInfo?.firmwareVersion || 'V3.5.2'}
                </span>
              </div>
              
              <div className="text-xs font-bold">
                DATE: <span className={isLight ? 'text-emerald-600 font-bold' : 'text-emerald-300'}>{todayDate || 'FETCHING...'}</span>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className={`p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>CURRENT TIME</div>
                <div className={`text-base sm:text-lg font-bold mt-1 truncate flex items-center gap-1.5 ${isLight ? 'text-amber-600' : 'text-amber-400 text-glow-amber'}`}>
                  <Clock className={`w-4 h-4 animate-pulse ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                  {currentTime || '00:00:00 AM'}
                </div>
                <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Live Indian Clock (IST)</div>
              </div>

              <div className={`p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>TOTAL PUNCHES</div>
                <div className={`text-2xl font-bold mt-0.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400 text-glow-green'}`}>{filteredRecords.length}</div>
                <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                  {dateFilter === 'TODAY' ? 'Punches today' : 'All historical punches'}
                </div>
              </div>

              <div className={`p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>EMPLOYEES PRESENT</div>
                <div className={`text-2xl font-bold mt-0.5 ${isLight ? 'text-sky-600' : 'text-sky-400 text-glow-cyan'}`}>{groupedList.length}</div>
                <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Unique Users</div>
              </div>

              <div className={`p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>MACHINE FETCH TIME</div>
                <div className={`text-base font-bold mt-1 truncate ${isLight ? 'text-sky-600' : 'text-sky-400 text-glow-cyan'}`}>{lastSyncTime}</div>
                <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Device Live Poll</div>
              </div>

              <div className={`p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>DB LAST UPDATE TIME</div>
                <div className={`text-base font-bold mt-1 truncate ${isLight ? 'text-emerald-600' : 'text-emerald-400 text-glow-green'}`}>
                  {filteredRecords.length > 0 ? filteredRecords[0].attendance_time : '--'}
                </div>
                <div className={`text-[10px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Supabase Cloud DB</div>
              </div>
            </div>

            {/* CLI Command Bar & Controls */}
            <div className={`border-2 p-3 rounded space-y-3 shadow-none ${
              isLight ? 'bg-white border-black text-slate-900' : 'bg-[#0c121e] border-slate-700/90'
            }`}>
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                
                {/* Search Bar */}
                <div className={`flex-1 flex items-center gap-2 px-3 py-1.5 rounded border-2 ${
                  isLight ? 'bg-white border-black focus-within:border-black' : 'bg-slate-950 border-slate-700 focus-within:border-sky-400'
                }`}>
                  <span className={`font-bold text-xs select-none ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>root@axom-server:~#</span>
                  <span className={`text-xs select-none ${isLight ? 'text-slate-700 font-semibold' : 'text-slate-500'}`}>grep --query=</span>
                  <input
                    type="text"
                    placeholder='"search employee or ID..."'
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className={`flex-1 bg-transparent border-none text-xs focus:outline-none font-mono font-bold ${
                      isLight ? 'text-slate-900 placeholder-slate-400' : 'text-sky-200 placeholder-slate-600'
                    }`}
                  />
                </div>

                {/* Command Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={scanLocalNetwork}
                    disabled={isScanning}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded border-2 text-xs font-bold transition-all disabled:opacity-50 active:scale-95 ${
                      isLight
                        ? 'bg-white border-black text-sky-700 hover:bg-sky-50'
                        : 'bg-sky-950/80 border-sky-500/50 text-sky-300 hover:bg-sky-900/60'
                    }`}
                  >
                    <Radar className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-500' : isLight ? 'text-sky-600' : 'text-sky-400'}`} />
                    <span>{isScanning ? './scanning_subnet...' : './scan_network'}</span>
                  </button>

                  <button
                    onClick={triggerManualSync}
                    disabled={isSyncing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded border-2 text-xs font-bold transition-all disabled:opacity-50 active:scale-95 ${
                      isLight
                        ? 'bg-white border-black text-emerald-700 hover:bg-emerald-50'
                        : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60'
                    }`}
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
                    <span>{isSyncing ? './executing...' : './hikvision_sync --force'}</span>
                  </button>

                  <button
                    onClick={handleAutoPollToggle}
                    className={`px-3 py-1.5 rounded border-2 text-xs font-bold transition-all ${
                      isAutoPoll
                        ? isLight
                          ? 'bg-white border-black text-slate-800'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                        : 'bg-red-950 border-red-800 text-red-400'
                    }`}
                  >
                    {isAutoPoll ? '[POLL: ON]' : '[POLL: PAUSED]'}
                  </button>
                </div>
              </div>
            </div>

            {/* View Mode & Date Filter Toggle Header */}
            <div className={`flex flex-col md:flex-row items-stretch md:items-center justify-between px-4 py-2 border-2 rounded-t border-b-0 text-xs gap-2 ${
              isLight ? 'bg-white border-black text-slate-900 font-bold' : 'bg-[#0b101c] border-slate-700/90 text-slate-300'
            }`}>
              <div className="flex flex-wrap items-center gap-2">
                {/* View Mode Buttons */}
                <button
                  onClick={() => handleViewModeChange('SUMMARY')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                    viewMode === 'SUMMARY'
                      ? isLight
                        ? 'bg-emerald-600 text-white border-2 border-black'
                        : 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 border border-emerald-400'
                      : isLight
                      ? 'bg-white text-slate-900 border-2 border-black hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>[SUMMARY VIEW]</span>
                </button>

                <button
                  onClick={() => handleViewModeChange('RAW')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                    viewMode === 'RAW'
                      ? isLight
                        ? 'bg-sky-600 text-white border-2 border-black'
                        : 'bg-sky-500 text-black shadow-md shadow-sky-500/20 border border-sky-400'
                      : isLight
                      ? 'bg-white text-slate-900 border-2 border-black hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>[RAW LOGS]</span>
                </button>

                <span className="text-slate-500 hidden sm:inline">|</span>

                {/* Standalone Previous Day Button */}
                <button
                  onClick={() => handleShiftDay(-1)}
                  title="Previous Day"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-bold text-xs transition-all active:scale-95 ${
                    isLight
                      ? 'bg-white border-black text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-sky-950/60 hover:border-sky-500/50'
                  }`}
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-sky-500" />
                  <span className="hidden sm:inline">PREV</span>
                </button>

                {/* Standalone Main Date Display Badge Popover Anchor */}
                <div className="relative">
                  <button
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded border-2 transition-all font-mono font-bold text-xs active:scale-95 ${
                      isLight
                        ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border-black'
                        : 'bg-emerald-950/80 text-emerald-400 hover:bg-emerald-900/60 border-emerald-500/50 shadow-md shadow-emerald-950/40'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{formatCustomDateLabel(startDate, endDate)}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isCalendarOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Custom Calendar Dropdown Modal */}
                  {isCalendarOpen && (
                    <div className={`absolute left-0 mt-2 z-50 p-3 rounded-lg border-2 shadow-2xl w-80 transition-all font-mono ${
                      isLight
                        ? 'bg-white border-black text-slate-900 shadow-slate-400/50'
                        : 'bg-[#090f1f] border-sky-500/60 text-sky-200 shadow-sky-950/80'
                    }`}>
                      {/* Banner Guide for Range Picking */}
                      {isPickingRangeEnd && (
                        <div className="mb-2 p-1.5 rounded text-[10px] font-bold text-center bg-amber-950/90 text-amber-300 border border-amber-500/50 animate-pulse">
                          👉 CLICK 2ND DATE TO COMPLETE RANGE
                        </div>
                      )}

                      {/* Dropdown Header: Month & Year Selector */}
                      <div className="flex items-center justify-between pb-2 mb-2 border-b font-bold border-slate-700">
                        <button
                          onClick={() => {
                            if (calendarMonth === 0) {
                              setCalendarMonth(11);
                              setCalendarYear(calendarYear - 1);
                            } else {
                              setCalendarMonth(calendarMonth - 1);
                            }
                          }}
                          className={`p-1 rounded hover:bg-slate-800 ${isLight ? 'hover:bg-slate-200' : ''}`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <span className="text-xs tracking-wider font-bold">
                          {['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'][calendarMonth]} {calendarYear}
                        </span>

                        <button
                          onClick={() => {
                            if (calendarMonth === 11) {
                              setCalendarMonth(0);
                              setCalendarYear(calendarYear + 1);
                            } else {
                              setCalendarMonth(calendarMonth + 1);
                            }
                          }}
                          className={`p-1 rounded hover:bg-slate-800 ${isLight ? 'hover:bg-slate-200' : ''}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Presets: TODAY / YESTERDAY / LAST 7 DAYS */}
                      <div className="flex gap-1 mb-2.5">
                        <button
                          onClick={() => setPresetDate('TODAY')}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                            isLight
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-400 hover:bg-emerald-100'
                              : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80 hover:bg-emerald-900'
                          }`}
                        >
                          [TODAY]
                        </button>
                        <button
                          onClick={() => setPresetDate('YESTERDAY')}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                            isLight
                              ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          [YESTERDAY]
                        </button>
                        <button
                          onClick={() => setPresetDate('LAST7DAYS')}
                          className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                            isLight
                              ? 'bg-sky-50 text-sky-700 border-sky-400 hover:bg-sky-100'
                              : 'bg-sky-950/80 text-sky-300 border-sky-700/80 hover:bg-sky-900'
                          }`}
                        >
                          [7 DAYS]
                        </button>
                      </div>

                      {/* Weekday Labels */}
                      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-1">
                        <span>SU</span><span>MO</span><span>TU</span><span>WE</span><span>TH</span><span>FR</span><span>SA</span>
                      </div>

                      {/* Day Grid */}
                      <div className="grid grid-cols-7 gap-1 text-center text-xs">
                        {Array.from({ length: new Date(calendarYear, calendarMonth, 1).getDay() }).map((_, i) => (
                          <div key={`empty-${i}`} />
                        ))}
                        {Array.from({ length: new Date(calendarYear, calendarMonth + 1, 0).getDate() }).map((_, i) => {
                          const dayNum = i + 1;
                          const formattedM = String(calendarMonth + 1).padStart(2, '0');
                          const formattedD = String(dayNum).padStart(2, '0');
                          const thisIso = `${calendarYear}-${formattedM}-${formattedD}`;
                          
                          const isStart = startDate === thisIso;
                          const isEnd = endDate === thisIso;
                          const minIso = endDate ? (startDate < endDate ? startDate : endDate) : startDate;
                          const maxIso = endDate ? (startDate > endDate ? startDate : endDate) : startDate;
                          const inRange = endDate && thisIso >= minIso && thisIso <= maxIso;

                          return (
                            <button
                              key={`day-${dayNum}`}
                              onClick={() => handleDateCellClick(thisIso)}
                              className={`py-1 rounded font-bold transition-all text-xs ${
                                isStart || isEnd
                                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/40 border border-emerald-400 scale-105'
                                  : inRange
                                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                                  : isLight
                                  ? 'hover:bg-slate-100 text-slate-800'
                                  : 'hover:bg-sky-950/60 text-slate-300'
                              }`}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Standalone Next Day Button */}
                <button
                  onClick={() => handleShiftDay(1)}
                  title="Next Day"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded border-2 font-bold text-xs transition-all active:scale-95 ${
                    isLight
                      ? 'bg-white border-black text-slate-900 hover:bg-slate-100'
                      : 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-sky-950/60 hover:border-sky-500/50'
                  }`}
                >
                  <span className="hidden sm:inline">NEXT</span>
                  <ChevronRight className="w-3.5 h-3.5 text-sky-500" />
                </button>
              </div>

              <div className="text-[11px] font-bold hidden md:block">
                {viewMode === 'SUMMARY'
                  ? `EMPLOYEES: ${groupedList.length} UNIQUE USER(S)`
                  : `RAW PUNCHES: ${filteredRecords.length} ENTRIES`}
              </div>
            </div>

            {/* Terminal Table Display */}
            <div className={`border-2 rounded-b overflow-hidden ${
              isLight ? 'bg-white border-black text-slate-900' : 'bg-[#070b14] border-slate-700/90'
            }`}>
              
              {viewMode === 'SUMMARY' ? (
                /* GROUPED CHECK-IN / CHECK-OUT TABLE */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className={`border-b-2 select-none ${
                      isLight ? 'bg-white text-slate-900 border-black font-bold' : 'bg-[#090e1a] text-slate-300 border-slate-700'
                    }`}>
                      <tr>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black text-amber-600' : 'border-slate-700 text-amber-400'}`}>#</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>EMPLOYEE_ID</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>USER_NAME</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>ATTENDANCE_DATE</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black text-emerald-600' : 'border-slate-700 text-emerald-400'}`}>
                          <span className="flex items-center gap-1">
                            <LogIn className="w-3.5 h-3.5" /> CHECK-IN (FIRST ENTRY)
                          </span>
                        </th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black text-sky-600' : 'border-slate-700 text-sky-400'}`}>
                          <span className="flex items-center gap-1">
                            <LogOut className="w-3.5 h-3.5" /> CHECK-OUT (LAST ENTRY)
                          </span>
                        </th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>PUNCH_COUNT</th>
                        <th className="py-2.5 px-3 font-bold">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y border-t ${
                      isLight ? 'border-black divide-black' : 'border-slate-700/80 divide-slate-800'
                    }`}>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-500" />
                              <span className="font-mono">EXEC: fetching attendance records for [{formatCustomDateLabel(startDate, endDate)}]...</span>
                            </div>
                          </td>
                        </tr>
                      ) : groupedList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO ATTENDANCE RECORDS FOUND FOR {formatCustomDateLabel(startDate, endDate)}]
                          </td>
                        </tr>
                      ) : (
                        groupedList.map((item, idx) => (
                          <tr
                            key={`${item.employee_id}_${item.attendance_date}`}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100 border-black text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
                            <td className={`py-2.5 px-3 border-r font-bold ${
                              isLight ? 'border-black text-amber-600' : 'border-slate-800/80 text-amber-400'
                            }`}>
                              #{idx + 1}
                            </td>
                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-black' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                  : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80'
                              }`}>
                                {item.employee_id}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 border-r font-bold ${
                              isLight ? 'border-black text-slate-900' : 'border-slate-800/80 text-white group-hover:text-sky-300'
                            }`}>
                              {item.user_name}
                            </td>
                            <td className={`py-2.5 px-3 border-r font-medium ${
                              isLight ? 'border-black text-slate-700' : 'border-slate-800/80 text-slate-300'
                            }`}>
                              {item.attendance_date}
                            </td>
                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-black' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-2 py-1 rounded border inline-flex items-center gap-1 ${
                                isLight
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                  : 'text-emerald-300 bg-emerald-950/90 border-emerald-700/80'
                              }`}>
                                <LogIn className={`w-3 h-3 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                {item.check_in_time}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-black' : 'border-slate-800/80'}`}>
                              {item.check_out_time !== '--' ? (
                                <span className={`font-bold px-2 py-1 rounded border inline-flex items-center gap-1 ${
                                  isLight
                                    ? 'text-sky-700 bg-sky-50 border-sky-400'
                                    : 'text-sky-300 bg-sky-950/90 border-sky-700/80'
                                }`}>
                                  <LogOut className={`w-3 h-3 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
                                  {item.check_out_time}
                                </span>
                              ) : (
                                <span className={`font-semibold px-2 py-1 rounded border inline-block ${
                                  isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-slate-400 bg-slate-900 border-slate-800'
                                }`}>
                                  -- (IN ONLY)
                                </span>
                              )}
                            </td>
                            <td className={`py-2.5 px-3 border-r font-bold ${
                              isLight ? 'border-black text-amber-600' : 'border-slate-800/80 text-amber-400'
                            }`}>
                              {item.total_punches} {item.total_punches === 1 ? 'Punch' : 'Punches'}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.check_out_time !== '--' ? (
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  isLight ? 'text-sky-700 bg-sky-50 border-sky-400' : 'text-sky-300 bg-sky-950/80 border-sky-700/80'
                                }`}>
                                  CHECKED OUT
                                </span>
                              ) : (
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border animate-pulse ${
                                  isLight ? 'text-emerald-700 bg-emerald-50 border-emerald-400' : 'text-emerald-400 bg-emerald-950/80 border-emerald-700/80'
                                }`}>
                                  IN OFFICE
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* RAW ALL PUNCHES LOG TABLE */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className={`border-b-2 select-none ${
                      isLight ? 'bg-white text-slate-900 border-black font-bold' : 'bg-[#090e1a] text-slate-300 border-slate-700'
                    }`}>
                      <tr>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black text-amber-600' : 'border-slate-700 text-amber-400'}`}>#</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>SERIAL</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>EMPLOYEE_ID</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>USER_NAME</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>DATE</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>PUNCH_TIME</th>
                        <th className={`py-2.5 px-3 border-r-2 font-bold ${isLight ? 'border-black' : 'border-slate-700'}`}>ATN_TOKEN</th>
                        <th className="py-2.5 px-3 font-bold">ENTRY_ID</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y border-t ${
                      isLight ? 'border-black divide-black' : 'border-slate-700/80 divide-slate-800'
                    }`}>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-sky-500" />
                              <span className="font-mono">EXEC: fetching raw attendance punches for [{formatCustomDateLabel(startDate, endDate)}]...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO RAW PUNCH RECORDS FOUND FOR {formatCustomDateLabel(startDate, endDate)}]
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((item, idx) => (
                          <tr
                            key={item.entry_id}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100 border-black text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
                            <td className={`py-2 px-3 border-r font-bold ${
                              isLight ? 'border-black text-amber-600' : 'border-slate-800/80 text-amber-400'
                            }`}>
                              #{idx + 1}
                            </td>
                            <td className={`py-2 px-3 border-r font-semibold ${
                              isLight ? 'border-black text-slate-700' : 'border-slate-800/80 text-slate-400'
                            }`}>
                              #{item.serial_no}
                            </td>
                            <td className={`py-2 px-3 border-r ${isLight ? 'border-black' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                  : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80'
                              }`}>
                                {item.employee_id}
                              </span>
                            </td>
                            <td className={`py-2 px-3 border-r font-bold ${
                              isLight ? 'border-black text-slate-900' : 'border-slate-800/80 text-white group-hover:text-sky-300'
                            }`}>
                              {item.user_name}
                            </td>
                            <td className={`py-2 px-3 border-r font-medium ${
                              isLight ? 'border-black text-slate-700' : 'border-slate-800/80 text-slate-300'
                            }`}>
                              {item.attendance_date}
                            </td>
                            <td className={`py-2 px-3 border-r ${isLight ? 'border-black' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-sky-700 bg-sky-50 border-sky-400'
                                  : 'text-sky-300 bg-sky-950/80 border-sky-800/80'
                              }`}>
                                {item.attendance_time}
                              </span>
                            </td>
                            <td className={`py-2 px-3 border-r ${
                              isLight ? 'border-black text-slate-600' : 'border-slate-800/80 text-slate-400'
                            }`}>
                              {item.atn_token}
                            </td>
                            <td className={`py-2 px-3 truncate max-w-[200px] ${isLight ? 'text-slate-500 font-medium' : 'text-slate-500'}`}>
                              {item.entry_id}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Terminal Live Activity Log Drawer */}
            <div className={`border-2 rounded p-3 space-y-2 ${
              isLight ? 'bg-white border-black text-slate-900' : 'bg-[#060911] border-slate-700/90'
            }`}>
              <div className={`flex items-center justify-between text-xs border-b pb-1.5 ${
                isLight ? 'border-black' : 'border-slate-800'
              }`}>
                <span className={`flex items-center gap-1.5 font-bold ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  <FileCode className="w-3.5 h-3.5" /> SYSTEM_LOG_OUTPUT (stdout) [{logs.length} EVENTS]
                </span>
                <button
                  onClick={() => setLogs([])}
                  className={`text-[10px] transition-colors flex items-center gap-1 font-bold ${
                    isLight ? 'text-slate-600 hover:text-red-600' : 'text-slate-500 hover:text-red-400'
                  }`}
                >
                  <Trash2 className="w-3 h-3" /> clear_stdout
                </button>
              </div>

              <div className="h-44 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-400">
                {logs.length === 0 ? (
                  <div className={`italic ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>No output logged yet. Waiting for system events...</div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`truncate ${
                        log.includes('ERROR') || log.includes('FATAL')
                          ? 'text-red-600 font-bold'
                          : log.includes('SUCCESS') || log.includes('SYNC_OK')
                          ? 'text-emerald-600 font-bold'
                          : log.includes('WARN')
                          ? 'text-amber-600 font-bold'
                          : log.includes('REALTIME')
                          ? 'text-amber-600 font-bold'
                          : log.includes('TICK')
                          ? 'text-sky-600'
                          : isLight ? 'text-slate-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Terminal Footer Navigation */}
            <div className={`flex flex-col sm:flex-row items-center justify-between text-[11px] border-t-2 pt-3 gap-2 font-bold ${
              isLight ? 'border-black text-slate-800' : 'border-slate-700/80 text-slate-400'
            }`}>
              <div>
                STATUS: <span className={isLight ? 'text-emerald-600 font-bold' : 'text-emerald-400'}>SUPABASE_CONNECTED</span> | DRIVER: <span className={isLight ? 'text-sky-600 font-bold' : 'text-sky-400'}>ISAPI_DIGEST_V2</span>
              </div>
              <div className="flex items-center gap-3">
                <span>[ESC] Exit</span>
                <span>[F5] Refresh</span>
                <span>[CTRL+C] Abort</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
