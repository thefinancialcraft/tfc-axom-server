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
  Cpu
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
  const [records, setRecords] = useState<RecordItem[]>([]);
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

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoState | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(true);

  const prevCountRef = useRef<number>(0);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 15)]);
  };

  const fetchAttendanceData = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const newRecordsList = data.records || [];
          const newTotal = data.total || 0;

          if (prevCountRef.current > 0 && newTotal > prevCountRef.current) {
            const diff = newTotal - prevCountRef.current;
            const topRecord = newRecordsList[0];
            const name = topRecord ? topRecord.user_name : 'Employee';
            const time = topRecord ? topRecord.attendance_time : '';
            addLog(`⚡ REALTIME AUTO PUNCH DETECTED: ${diff} New Record(s)! [${name}] at ${time}`);
          }
          prevCountRef.current = newTotal;

          if (data.deviceInfo) {
            setDeviceInfo(data.deviceInfo);
            if (data.deviceInfo.ip) setDeviceIp(data.deviceInfo.ip);
          }

          setRecords(newRecordsList);
          setTotal(newTotal);
          setTodayDate(data.todayDate || new Date().toLocaleDateString('en-GB'));
        }
      }
    } catch (err: any) {
      addLog(`ERROR: Failed to fetch attendance data - ${err.message}`);
    } finally {
      setLoading(false);
      setIsCheckingStatus(false);
    }
  }, []);

  const triggerManualSync = async () => {
    setIsSyncing(true);
    addLog(`EXEC: ./hikvision_sync --device=${deviceIp}...`);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.deviceIp) setDeviceIp(data.deviceIp);
        const count = data.newRecordsInserted || 0;
        const maxS = data.lastSerial || 0;
        addLog(`SUCCESS: Device (${data.deviceIp || deviceIp}) sync complete. Inserted: ${count} record(s). Max Serial: #${maxS}`);
        setLastSyncTime(new Date().toLocaleTimeString());
        await fetchAttendanceData();
      } else {
        addLog(`ERROR: Device sync HTTP ${res.status}`);
      }
    } catch (err: any) {
      addLog(`FATAL: Connection exception - ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const scanLocalNetwork = async () => {
    setIsScanning(true);
    addLog(`SCANNING: Discovering Hikvision devices on Wi-Fi / LAN subnets...`);
    try {
      const res = await fetch('/api/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.ip) {
          setDeviceIp(data.ip);
          if (data.isDiscovered) {
            addLog(`SUCCESS: Found Hikvision device on IP: ${data.ip} (Scanned ${data.scannedCount} addresses)`);
          } else {
            addLog(`WARN: No response from new IP scan. Defaulting to: ${data.ip}`);
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

  useEffect(() => {
    addLog(`INIT: Axom Biometric Daemon initialized.`);
    addLog(`NETWORK: Auto-detecting local LAN/Wi-Fi subnets...`);
    fetchAttendanceData();
    setLastSyncTime(new Date().toLocaleTimeString());

    let interval: any;
    if (isAutoPoll) {
      interval = setInterval(() => {
        fetchAttendanceData();
      }, 2000);
    }

    return () => clearInterval(interval);
  }, [fetchAttendanceData, isAutoPoll]);

  const filteredRecords = records.filter(
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

  return (
    <div className="min-h-screen bg-[#05080f] text-sky-400 p-2 sm:p-4 md:p-6 font-mono selection:bg-emerald-500 selection:text-black">
      <div className="max-w-7xl mx-auto space-y-4">
        
        {/* Terminal Main Container Window */}
        <div className="terminal-window rounded-lg border-2 border-slate-700/80 bg-[#090d16]/95 shadow-2xl shadow-sky-500/10 overflow-hidden">
          
          {/* Terminal Window Header Bar */}
          <div className="terminal-header px-4 py-2.5 bg-[#0f172a] border-b-2 border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/90 inline-block shadow-sm shadow-red-500/50"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500/90 inline-block shadow-sm shadow-yellow-500/50"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block shadow-sm shadow-emerald-500/50"></span>
              <span className="ml-2 text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                root@tfc-biometric-monitor: /srv/www/tfc-biometric-monitor (bash)
              </span>
            </div>

            <div className="flex items-center gap-3 text-[11px]">
              {isCheckingStatus || !deviceInfo ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-amber-400 font-bold bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-700/80 shadow-sm shadow-amber-500/20">
                  <RotateCw className="w-3 h-3 text-amber-400 animate-spin" />
                  FETCHING DEVICE STATUS...
                </span>
              ) : deviceInfo.isConnected ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-emerald-400 font-bold bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-700/80 shadow-sm shadow-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  MACHINE CONNECTED [{deviceInfo.model || 'DS-K1T320EFWX'}]
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-red-400 font-bold bg-red-950/80 px-2.5 py-0.5 rounded border border-red-700/80 shadow-sm shadow-red-500/20">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  MACHINE OFFLINE [{deviceIp}]
                </span>
              )}
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">TTY1</span>
            </div>
          </div>

          {/* ASCII Banner & System Specs */}
          <div className="p-4 sm:p-6 space-y-5">
            <pre className="text-[9px] sm:text-[11px] leading-tight text-emerald-400/90 font-mono hidden sm:block overflow-x-auto select-none border border-slate-800 p-2.5 rounded bg-[#060a12]">
{`  _____ _____ ____   ____ ___  __  __ _____ _____ ____ ___ ____   __  __  ___  _  _____ _____ ___  ____  
 |_   _|  ___/ ___| | __ ) _ \\|  \\/  | ____|_   _|  _ |_ _/ ___| |  \\/  |/ _ \\| |/ /_ _|_   _/ _ \\|  _ \\ 
   | | | |_ | |     |  _ \\ | | | |\\/| |  _|   | | | |_) | | |     | |\\/| | | | | ' / | |  | || | | | |_) |
   | | |  _|| |___  | |_) | |_| | |  | | |___  | | |  _ <| | |___  | |  | | |_| | . \\ | |  | || |_| |  _ < 
   |_| |_|   \\____| |____/\\___/|_|  |_|_____| |_| |_| \\_\\___\\____| |_|  |_|\\___/|_|\\_\\___| |_| \\___/|_| \\_\\`}
            </pre>

            <div className="flex flex-wrap items-center justify-between gap-2 border-y-2 border-slate-700/80 py-2.5 text-xs bg-[#0b101c] px-3 rounded">
              <div className="flex flex-wrap items-center gap-4 text-slate-300">
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> MODEL: {deviceInfo?.model || 'DS-K1T320EFWX'}
                </span>
                <span className="text-slate-600">::</span>
                <span className="text-sky-300 flex items-center gap-1 font-bold">
                  <Wifi className="w-3.5 h-3.5 text-sky-400 animate-pulse" /> IP: {deviceIp} (MAC: {deviceInfo?.macAddress || 'a4:d5:c2:1c:4d:83'})
                </span>
                <span className="text-slate-600">::</span>
                <span className="text-amber-400 flex items-center gap-1 font-bold">
                  <Cpu className="w-3.5 h-3.5 text-amber-400" /> FW: {deviceInfo?.firmwareVersion || 'V3.5.2'}
                </span>
              </div>
              
              <div className="text-xs text-slate-400 font-bold">
                DATE: <span className="text-emerald-300">{todayDate || 'FETCHING...'}</span>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-[#0c1220] border-2 border-slate-700/90 rounded shadow-md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">CURRENT TIME</div>
                <div className="text-base sm:text-lg font-bold text-amber-400 text-glow-amber mt-1 truncate flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
                  {currentTime || '00:00:00 AM'}
                </div>
                <div className="text-[10px] text-slate-500 font-medium">Live Indian Clock (IST)</div>
              </div>

              <div className="p-3 bg-[#0c1220] border-2 border-slate-700/90 rounded shadow-md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">TOTAL PUNCHES</div>
                <div className="text-2xl font-bold text-emerald-400 text-glow-green mt-0.5">{total}</div>
                <div className="text-[10px] text-slate-500 font-medium">Records today</div>
              </div>

              <div className="p-3 bg-[#0c1220] border-2 border-slate-700/90 rounded shadow-md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">EMPLOYEES PRESENT</div>
                <div className="text-2xl font-bold text-sky-400 text-glow-cyan mt-0.5">{groupedList.length}</div>
                <div className="text-[10px] text-slate-500 font-medium">Unique Users Today</div>
              </div>

              <div className="p-3 bg-[#0c1220] border-2 border-slate-700/90 rounded shadow-md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">MACHINE FETCH TIME</div>
                <div className="text-base font-bold text-sky-400 text-glow-cyan mt-1 truncate">{lastSyncTime}</div>
                <div className="text-[10px] text-slate-400 font-medium">Device Live Poll</div>
              </div>

              <div className="p-3 bg-[#0c1220] border-2 border-slate-700/90 rounded shadow-md">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">DB LAST UPDATE TIME</div>
                <div className="text-base font-bold text-emerald-400 text-glow-green mt-1 truncate">
                  {records.length > 0 ? records[0].attendance_time : '--'}
                </div>
                <div className="text-[10px] text-slate-400 font-medium">Supabase Cloud DB</div>
              </div>
            </div>

            {/* CLI Command Bar & Controls */}
            <div className="bg-[#0c121e] border-2 border-slate-700/90 p-3 rounded space-y-3 shadow-md">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                
                {/* Search Bar */}
                <div className="flex-1 flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded border-2 border-slate-700 focus-within:border-sky-400">
                  <span className="text-emerald-400 font-bold text-xs select-none">root@axom-server:~#</span>
                  <span className="text-slate-500 text-xs select-none">grep --query=</span>
                  <input
                    type="text"
                    placeholder='"search employee or ID..."'
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 bg-transparent border-none text-xs text-sky-200 focus:outline-none placeholder-slate-600 font-mono"
                  />
                </div>

                {/* Command Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={scanLocalNetwork}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-950/80 border-2 border-sky-500/50 hover:bg-sky-900/60 text-sky-300 text-xs font-semibold transition-all disabled:opacity-50 active:scale-95 shadow-sm shadow-sky-500/10"
                  >
                    <Radar className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-amber-400' : 'text-sky-400'}`} />
                    <span>{isScanning ? './scanning_subnet...' : './scan_network'}</span>
                  </button>

                  <button
                    onClick={triggerManualSync}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-950/80 border-2 border-emerald-500/50 hover:bg-emerald-900/60 text-emerald-400 text-xs font-semibold transition-all disabled:opacity-50 active:scale-95 shadow-sm shadow-emerald-500/10"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? './executing...' : './hikvision_sync --force'}</span>
                  </button>

                  <button
                    onClick={() => setIsAutoPoll(!isAutoPoll)}
                    className={`px-3 py-1.5 rounded border-2 text-xs font-semibold transition-all ${
                      isAutoPoll
                        ? 'bg-slate-900 border-slate-700 text-slate-300'
                        : 'bg-red-950 border-red-800 text-red-400'
                    }`}
                  >
                    {isAutoPoll ? '[POLL: ON]' : '[POLL: PAUSED]'}
                  </button>
                </div>
              </div>
            </div>

            {/* View Mode Toggle Header */}
            <div className="flex items-center justify-between bg-[#0b101c] px-4 py-2 border-2 border-slate-700/90 rounded-t border-b-0 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('SUMMARY')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                    viewMode === 'SUMMARY'
                      ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 border border-emerald-400'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>[SUMMARY VIEW: CHECK-IN / CHECK-OUT]</span>
                </button>

                <button
                  onClick={() => setViewMode('RAW')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded font-bold transition-all ${
                    viewMode === 'RAW'
                      ? 'bg-sky-500 text-black shadow-md shadow-sky-500/20 border border-sky-400'
                      : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>[RAW LOGS: ALL PUNCHES]</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-300 font-semibold hidden md:block">
                {viewMode === 'SUMMARY'
                  ? `EMPLOYEES: ${groupedList.length} UNIQUE RECORD(S)`
                  : `RAW PUNCHES: ${filteredRecords.length} ENTRIES`}
              </div>
            </div>

            {/* Terminal Table Display */}
            <div className="border-2 border-slate-700/90 bg-[#070b14] rounded-b overflow-hidden shadow-lg">
              
              {viewMode === 'SUMMARY' ? (
                /* GROUPED CHECK-IN / CHECK-OUT TABLE */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono border-collapse">
                    <thead className="bg-[#090e1a] text-slate-300 border-b-2 border-slate-700 select-none">
                      <tr>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">EMPLOYEE_ID</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">USER_NAME</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">ATTENDANCE_DATE</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 text-emerald-400 font-bold">
                          <span className="flex items-center gap-1">
                            <LogIn className="w-3.5 h-3.5" /> CHECK-IN (FIRST ENTRY)
                          </span>
                        </th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 text-sky-400 font-bold">
                          <span className="flex items-center gap-1">
                            <LogOut className="w-3.5 h-3.5" /> CHECK-OUT (LAST ENTRY)
                          </span>
                        </th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">PUNCH_COUNT</th>
                        <th className="py-2.5 px-3 font-bold">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-t border-slate-700/80 divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 border border-slate-800">
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-400" />
                              <span>EXEC: calculating employee Check-In / Check-Out summaries...</span>
                            </div>
                          </td>
                        </tr>
                      ) : groupedList.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 border border-slate-800">
                            [NO ATTENDANCE RECORDS FOUND FOR TODAY]
                          </td>
                        </tr>
                      ) : (
                        groupedList.map((item) => (
                          <tr
                            key={`${item.employee_id}_${item.attendance_date}`}
                            className="hover:bg-sky-950/40 border-b border-slate-800/80 transition-colors group"
                          >
                            <td className="py-2.5 px-3 border-r border-slate-800/80">
                              <span className="text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                                {item.employee_id}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-800/80 text-white font-medium group-hover:text-sky-300">
                              {item.user_name}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-800/80 text-slate-300 font-medium">
                              {item.attendance_date}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-800/80">
                              <span className="text-emerald-300 font-bold bg-emerald-950/90 px-2 py-1 rounded border border-emerald-700/80 inline-flex items-center gap-1">
                                <LogIn className="w-3 h-3 text-emerald-400" />
                                {item.check_in_time}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-800/80">
                              {item.check_out_time !== '--' ? (
                                <span className="text-sky-300 font-bold bg-sky-950/90 px-2 py-1 rounded border border-sky-700/80 inline-flex items-center gap-1">
                                  <LogOut className="w-3 h-3 text-sky-400" />
                                  {item.check_out_time}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-semibold px-2 py-1 rounded bg-slate-900 border border-slate-800 inline-block">
                                  -- (IN ONLY)
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-800/80 text-amber-400 font-bold">
                              {item.total_punches} {item.total_punches === 1 ? 'Punch' : 'Punches'}
                            </td>
                            <td className="py-2.5 px-3">
                              {item.check_out_time !== '--' ? (
                                <span className="text-[11px] font-bold text-sky-300 bg-sky-950/80 border border-sky-700/80 px-2 py-0.5 rounded">
                                  CHECKED OUT
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700/80 px-2 py-0.5 rounded animate-pulse">
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
                    <thead className="bg-[#090e1a] text-slate-300 border-b-2 border-slate-700 select-none">
                      <tr>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">SERIAL</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">EMPLOYEE_ID</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">USER_NAME</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">DATE</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">PUNCH_TIME</th>
                        <th className="py-2.5 px-3 border-r-2 border-slate-700 font-bold">ATN_TOKEN</th>
                        <th className="py-2.5 px-3 font-bold">ENTRY_ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y border-t border-slate-700/80 divide-slate-800">
                      {loading ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 border border-slate-800">
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-400" />
                              <span>EXEC: fetching raw records...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-500 border border-slate-800">
                            [NO RECORDS FOUND IN ATTENDANCE_LOGS]
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((item) => (
                          <tr
                            key={item.entry_id}
                            className="hover:bg-sky-950/40 border-b border-slate-800/80 transition-colors group"
                          >
                            <td className="py-2 px-3 border-r border-slate-800/80 text-amber-400 font-semibold">
                              #{item.serial_no}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-800/80">
                              <span className="text-emerald-400 font-bold bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                                {item.employee_id}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-800/80 text-white font-medium group-hover:text-sky-300">
                              {item.user_name}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-800/80 text-slate-300 font-medium">
                              {item.attendance_date}
                            </td>
                            <td className="py-2 px-3 border-r border-slate-800/80">
                              <span className="text-sky-300 font-bold bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/80">
                                {item.attendance_time}
                              </span>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-800/80 text-slate-400">
                              {item.atn_token}
                            </td>
                            <td className="py-2 px-3 text-slate-500 truncate max-w-[200px]">
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
            <div className="border-2 border-slate-700/90 bg-[#060911] rounded p-3 space-y-2 shadow-md">
              <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-1.5">
                <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <FileCode className="w-3.5 h-3.5" /> SYSTEM_LOG_OUTPUT (stdout)
                </span>
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> clear_stdout
                </button>
              </div>

              <div className="h-28 overflow-y-auto space-y-1 font-mono text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-800">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic">No output logged yet. Waiting for system events...</div>
                ) : (
                  logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={`truncate ${
                        log.includes('ERROR') || log.includes('FATAL')
                          ? 'text-red-400 font-semibold'
                          : log.includes('SUCCESS')
                          ? 'text-emerald-400'
                          : log.includes('WARN')
                          ? 'text-yellow-400'
                          : log.includes('REALTIME')
                          ? 'text-amber-400 font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Terminal Footer Navigation */}
            <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 border-t-2 border-slate-700/80 pt-3 gap-2 font-semibold">
              <div>
                STATUS: <span className="text-emerald-400 font-bold">SUPABASE_CONNECTED</span> | DRIVER: <span className="text-sky-400 font-bold">ISAPI_DIGEST_V2</span>
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
