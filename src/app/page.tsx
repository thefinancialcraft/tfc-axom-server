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
  Calendar
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
  const [customDate, setCustomDate] = useState<string>(() => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD}`;
  });
  
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
      const dateParam = dateFilter === 'TODAY' ? 'TODAY' : dateFilter === 'CUSTOM' ? customDate : 'ALL';
      addLog(`FETCH: Requesting /api/attendance?date=${dateParam} from Supabase Cloud...`);
      const res = await fetch(`/api/attendance?date=${dateParam}`);
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
          
          addLog(`SYNC_OK: Fetched ${newTotal} record(s) matching filter [${dateParam}].`);
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
  }, [addLog, checkBrowserDirectConnection, deviceIp, dateFilter, customDate]);

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
    if (dateVal) setCustomDate(dateVal);
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

  // Polling ONLY runs after status check completes AND machine is CONNECTED!
  useEffect(() => {
    let interval: any;

    if (!isCheckingStatus && deviceInfo && deviceInfo.isConnected && isAutoPoll) {
      addLog(`POLLING_HEARTBEAT: Machine connected [${deviceInfo.ip}]. Polling active (every 2.0s).`);
      interval = setInterval(() => {
        addLog(`TICK: 2.0s poll tick triggered.`);
        fetchAttendanceData();
      }, 2000);
    } else if (!isCheckingStatus && (!deviceInfo || !deviceInfo.isConnected)) {
      addLog(`POLLING_IDLE: Auto-polling paused because machine is currently OFFLINE.`);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCheckingStatus, deviceInfo, isAutoPoll, fetchAttendanceData, addLog]);

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

  // Active records depending on dateFilter selection
  const activeSourceRecords = dateFilter === 'TODAY'
    ? allRecords.filter((r) => isRecordMatchingDate(r.attendance_date, todayIso))
    : dateFilter === 'CUSTOM' && customDate
    ? allRecords.filter((r) => isRecordMatchingDate(r.attendance_date, customDate))
    : allRecords;

  const filteredRecords = activeSourceRecords.filter(
    (item) =>
      item.user_name.toLowerCase().includes(search.toLowerCase()) ||
      item.employee_id.toLowerCase().includes(search.toLowerCase()) ||
      item.atn_token.toLowerCase().includes(search.toLowerCase()) ||
      item.entry_id.toLowerCase().includes(search.toLowerCase())
  );

  // Group records by Employee ID & Date -> First punch = Check In, Last punch = Check Out
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
      const sorted = [...list].sort((a, b) => (a.serial_no || 0) - (b.serial_no || 0));

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const check_in_time = first.attendance_time;
      const check_out_time = sorted.length > 1 ? last.attendance_time : '--';

      grouped.push({
        employee_id: first.employee_id,
        user_name: first.user_name,
        attendance_date: first.attendance_date,
        check_in_time,
        check_out_time,
        total_punches: sorted.length,
      });
    });

    return grouped.sort((a, b) => a.employee_id.localeCompare(b.employee_id));
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

                {/* Date Filter Buttons & Interactive Custom Date Picker */}
                <button
                  onClick={() => handleDateFilterChange('TODAY')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all ${
                    dateFilter === 'TODAY'
                      ? isLight
                        ? 'bg-emerald-600 text-white border-2 border-black'
                        : 'bg-emerald-500 text-black border border-emerald-400'
                      : isLight
                      ? 'bg-white text-slate-900 border-2 border-black hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>[TODAY ({allRecords.filter((r) => isRecordMatchingDate(r.attendance_date, todayIso)).length})]</span>
                </button>

                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all border-2 ${
                  dateFilter === 'CUSTOM'
                    ? isLight
                      ? 'bg-sky-600 text-white border-black'
                      : 'bg-sky-500 text-black border-sky-400'
                    : isLight
                    ? 'bg-white text-slate-900 border-black hover:bg-slate-100'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}>
                  <Calendar className="w-3.5 h-3.5" />
                  <span className="text-[11px]">DATE:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      if (e.target.value) {
                        setCustomDate(e.target.value);
                        handleDateFilterChange('CUSTOM', e.target.value);
                      }
                    }}
                    className={`bg-transparent text-xs font-mono font-bold focus:outline-none cursor-pointer ${
                      dateFilter === 'CUSTOM' && !isLight ? 'text-black' : isLight ? 'text-slate-900' : 'text-sky-300'
                    }`}
                  />
                </div>

                <button
                  onClick={() => handleDateFilterChange('ALL')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-bold transition-all ${
                    dateFilter === 'ALL'
                      ? isLight
                        ? 'bg-amber-500 text-black border-2 border-black'
                        : 'bg-amber-500 text-black border border-amber-400'
                      : isLight
                      ? 'bg-white text-slate-900 border-2 border-black hover:bg-slate-100'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>[ALL ({allRecords.length})]</span>
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
                          <td colSpan={7} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-600" />
                              <span>EXEC: calculating employee Check-In / Check-Out summaries...</span>
                            </div>
                          </td>
                        </tr>
                      ) : groupedList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO ATTENDANCE RECORDS FOUND FOR {dateFilter === 'TODAY' ? "TODAY" : "SELECTED FILTER"}]
                          </td>
                        </tr>
                      ) : (
                        groupedList.map((item) => (
                          <tr
                            key={`${item.employee_id}_${item.attendance_date}`}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100 border-black text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
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
                          <td colSpan={7} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-600" />
                              <span>EXEC: fetching raw records...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className={`py-8 text-center border ${isLight ? 'border-black text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO RECORDS FOUND IN ATTENDANCE_LOGS]
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((item) => (
                          <tr
                            key={item.entry_id}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100 border-black text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
                            <td className={`py-2 px-3 border-r font-semibold ${
                              isLight ? 'border-black text-amber-600 font-bold' : 'border-slate-800/80 text-amber-400'
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
