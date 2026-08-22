'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
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
  UserCheck,
  Percent,
  TrendingUp,
  Activity,
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
  ChevronDown,
  Settings
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
  has_punched: boolean;
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
  const [inactiveEmpIds, setInactiveEmpIds] = useState<Set<string>>(new Set());
  const [activeEmployeesList, setActiveEmployeesList] = useState<{ employeeId: string; employeeName: string }[]>([]);

  // Offline Auto-Scan 5-Retry & 1-Hour Pause Engine Refs/State
  const offlineRetryCountRef = useRef<number>(0);
  const offlinePausedUntilRef = useRef<number | null>(null);
  const lastScanTimestampRef = useRef<number>(0);
  const [offlinePauseState, setOfflinePauseState] = useState<{ isPaused: boolean; minsLeft: number; pauseUntilStr: string }>({
    isPaused: false,
    minsLeft: 0,
    pauseUntilStr: '',
  });

  const resetOfflineRetryState = useCallback(() => {
    offlineRetryCountRef.current = 0;
    offlinePausedUntilRef.current = null;
    lastScanTimestampRef.current = 0;
    setOfflinePauseState({ isPaused: false, minsLeft: 0, pauseUntilStr: '' });
  }, []);

  const fetchActiveEmployees = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.employees)) {
          const inactive = new Set<string>();
          const activeList: { employeeId: string; employeeName: string }[] = [];
          data.employees.forEach((emp: any) => {
            if (emp.is_active === false) {
              inactive.add(emp.employeeId);
            } else {
              activeList.push({
                employeeId: emp.employeeId,
                employeeName: emp.employeeName || emp.employeeId,
              });
            }
          });
          setInactiveEmpIds(inactive);
          setActiveEmployeesList(activeList);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchActiveEmployees();
  }, [fetchActiveEmployees]);

  // Typewriter & Backspace Erase Animation Effect (Mobile Optimized)
  const singleLinePhrases = [
    'TFC BIOMETRIC MONITOR',
    'TFC REALTIME RELAY ENGINE',
    'HIKVISION CLOUD SYNC v2.0',
    'SMART ATTENDANCE DASHBOARD',
    'INSTANT FINGERPRINT LOGS',
  ];

  const [currentPhraseIdx, setCurrentPhraseIdx] = useState<number>(0);
  const [typedSingleTitle, setTypedSingleTitle] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    let timerId: any = null;
    const currentFullText = singleLinePhrases[currentPhraseIdx];

    if (!isDeleting && typedSingleTitle.length < currentFullText.length) {
      // TYPING FORWARD
      timerId = setTimeout(() => {
        setTypedSingleTitle(currentFullText.slice(0, typedSingleTitle.length + 1));
      }, 50);
    } else if (!isDeleting && typedSingleTitle.length === currentFullText.length) {
      // FULLY TYPED -> PAUSE THEN START ERASING
      timerId = setTimeout(() => {
        setIsDeleting(true);
      }, 3500);
    } else if (isDeleting && typedSingleTitle.length > 0) {
      // BACKSPACE ERASING BACKWARDS
      timerId = setTimeout(() => {
        setTypedSingleTitle(currentFullText.slice(0, typedSingleTitle.length - 1));
      }, 25);
    } else if (isDeleting && typedSingleTitle.length === 0) {
      // FULLY ERASED -> SWITCH TO NEXT PHRASE
      setIsDeleting(false);
      setCurrentPhraseIdx((prev) => (prev + 1) % singleLinePhrases.length);
    }

    return () => clearTimeout(timerId);
  }, [typedSingleTitle, isDeleting, currentPhraseIdx]);

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
    resetOfflineRetryState();
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
    resetOfflineRetryState();
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

  // Dynamic Auto Polling & Offline Auto-Scan Engine (2s Online Polling, 10s Offline Scanning with 5-retry limit & 1hr pause)
  useEffect(() => {
    let interval: any;

    if (!isCheckingStatus && isAutoPoll) {
      const isOnline = deviceInfo && deviceInfo.isConnected;

      if (isOnline) {
        if (offlineRetryCountRef.current !== 0 || offlinePausedUntilRef.current !== null) {
          resetOfflineRetryState();
        }
        addLog(`POLLING_HEARTBEAT: Machine connected [${deviceInfo.ip}]. Polling active (every 2.0s).`);
        interval = setInterval(() => {
          fetchAttendanceData();
        }, 2000);
      } else {
        const targetIp = deviceInfo?.ip || deviceIp;

        const runOfflineScanStep = async () => {
          const now = Date.now();

          // 1. Check if 1-hour pause is currently active
          if (offlinePausedUntilRef.current && now < offlinePausedUntilRef.current) {
            const minsLeft = Math.ceil((offlinePausedUntilRef.current - now) / 60000);
            const timeStr = new Date(offlinePausedUntilRef.current).toLocaleTimeString();
            setOfflinePauseState({ isPaused: true, minsLeft, pauseUntilStr: timeStr });
            return;
          }

          // 2. Check if 1-hour pause has expired -> Reset counter & resume
          if (offlinePausedUntilRef.current && now >= offlinePausedUntilRef.current) {
            offlinePausedUntilRef.current = null;
            offlineRetryCountRef.current = 0;
            lastScanTimestampRef.current = 0;
            setOfflinePauseState({ isPaused: false, minsLeft: 0, pauseUntilStr: '' });
            addLog(`OFFLINE_RESUME: 1-hour pause expired. Resuming auto-scan cycle...`);
          }

          // 3. Throttle safeguard: Ensure at least 9.5s between offline retry attempts
          if (lastScanTimestampRef.current > 0 && now - lastScanTimestampRef.current < 9500) {
            return;
          }
          lastScanTimestampRef.current = now;

          // 4. Perform scan attempt if within 5-retry limit
          if (offlineRetryCountRef.current < 5) {
            offlineRetryCountRef.current += 1;
            const currentAttempt = offlineRetryCountRef.current;
            addLog(`OFFLINE_SCAN (${currentAttempt}/5): Machine offline [${targetIp}]. Probing connection (10.0s tick)...`);
            try {
              fetch('/api/scan').catch(() => null);
            } catch {}
            fetchAttendanceData();
          } else {
            // 5. 5 retries failed -> Trigger 1-hour pause
            const pauseUntilMs = now + 3600000; // 1 hour = 3,600,000 ms
            offlinePausedUntilRef.current = pauseUntilMs;
            const timeStr = new Date(pauseUntilMs).toLocaleTimeString();
            setOfflinePauseState({ isPaused: true, minsLeft: 60, pauseUntilStr: timeStr });
            addLog(`OFFLINE_PAUSED: Max retries (5/5) reached. Machine non-responsive. Pausing auto-scan for 1 hour (until ${timeStr}). Click ./scan to retry.`);
          }
        };

        // Run immediate scan step when going offline
        runOfflineScanStep();

        interval = setInterval(() => {
          runOfflineScanStep();
        }, 10000);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCheckingStatus, deviceInfo, isAutoPoll, fetchAttendanceData, addLog, deviceIp, resetOfflineRetryState]);

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

  // Active records filtered by Date Range & Active Employee Status (Inactive employees hidden)
  const activeSourceRecords = allRecords.filter(
    (r) =>
      isRecordMatchingRange(r.attendance_date, startDate, endDate) &&
      !inactiveEmpIds.has(r.employee_id)
  );

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

  // Group records by Employee ID & Date -> Pre-fill entries for ALL ACTIVE EMPLOYEES!
  const getGroupedAttendance = (): GroupedAttendance[] => {
    const map = new Map<string, RecordItem[]>();

    for (const item of filteredRecords) {
      const key = item.employee_id;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }

    const grouped: GroupedAttendance[] = [];
    const processedEmpIds = new Set<string>();

    // 1. Process all active employees from master active employees list
    activeEmployeesList.forEach((emp) => {
      // Filter by search query
      const matchesSearch =
        search === '' ||
        emp.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return;

      processedEmpIds.add(emp.employeeId);
      const list = map.get(emp.employeeId) || [];

      if (list.length > 0) {
        // Employee has punched!
        const sorted = [...list].sort((a, b) => getPunchSecondsOfDay(a) - getPunchSecondsOfDay(b));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const check_in_time = first.attendance_time;
        const check_out_time = sorted.length > 1 ? last.attendance_time : '--';
        const latest_punch_seconds = getPunchSecondsOfDay(last);

        grouped.push({
          employee_id: emp.employeeId,
          user_name: emp.employeeName || first.user_name,
          attendance_date: first.attendance_date || todayDate || '--',
          check_in_time,
          check_out_time,
          total_punches: sorted.length,
          latest_punch_seconds,
          has_punched: true,
        });
      } else {
        // Active employee has NOT punched yet -> Pre-filled row with --
        grouped.push({
          employee_id: emp.employeeId,
          user_name: emp.employeeName,
          attendance_date: todayDate || '--',
          check_in_time: '--',
          check_out_time: '--',
          total_punches: 0,
          latest_punch_seconds: -1,
          has_punched: false,
        });
      }
    });

    // 2. Also process any punches for active employees not in activeEmployeesList yet
    Array.from(map.entries()).forEach(([empId, list]) => {
      if (!processedEmpIds.has(empId) && !inactiveEmpIds.has(empId) && list.length > 0) {
        const sorted = [...list].sort((a, b) => getPunchSecondsOfDay(a) - getPunchSecondsOfDay(b));
        const first = sorted[0];
        const last = sorted[sorted.length - 1];

        grouped.push({
          employee_id: first.employee_id,
          user_name: first.user_name,
          attendance_date: first.attendance_date,
          check_in_time: first.attendance_time,
          check_out_time: sorted.length > 1 ? last.attendance_time : '--',
          total_punches: sorted.length,
          latest_punch_seconds: getPunchSecondsOfDay(last),
          has_punched: true,
        });
      }
    });

    // Sort order:
    // 1. Punched employees sorted descending by latest_punch_seconds (latest updated first!)
    // 2. Unpunched pre-filled employees sorted alphabetically by user_name!
    return grouped.sort((a, b) => {
      if (a.has_punched && b.has_punched) {
        return b.latest_punch_seconds - a.latest_punch_seconds;
      }
      if (a.has_punched && !b.has_punched) return -1;
      if (!a.has_punched && b.has_punched) return 1;
      return a.user_name.localeCompare(b.user_name);
    });
  };

  const groupedList = getGroupedAttendance();

  const totalActiveUsers = activeEmployeesList.length > 0 ? activeEmployeesList.length : 56;
  const presentUsersCount = groupedList.filter((item) => item.has_punched).length;
  const attendanceRate = totalActiveUsers > 0 ? ((presentUsersCount / totalActiveUsers) * 100).toFixed(1) : '0.0';

  const isLight = theme === 'LIGHT';

  return (
    <div className={`min-h-screen p-0 sm:p-4 md:p-6 font-mono transition-colors duration-300 selection:bg-emerald-500 selection:text-black w-full max-w-full overflow-x-hidden ${
      isLight ? 'bg-[#f1f5f9] text-slate-900' : 'bg-[#05080f] text-sky-400'
    }`}>
      <div className="max-w-7xl mx-auto space-y-0 sm:space-y-4 w-full max-w-full overflow-hidden">
        
        {/* Terminal Main Container Window */}
        <div className={`terminal-window rounded-none sm:rounded-lg border-0 sm:border-2 overflow-hidden transition-colors duration-300 w-full max-w-full ${
          isLight
            ? 'bg-slate-50 sm:border-2 border-slate-300 shadow-none'
            : 'bg-[#090d16]/95 sm:border-slate-700/80 shadow-none sm:shadow-2xl shadow-sky-500/10'
        }`}>
          
          {/* Terminal Window Header Bar */}
          <div className={`terminal-header px-2.5 sm:px-4 py-2 sm:py-2.5 border-b-2 flex items-center justify-between transition-colors gap-2 w-full max-w-full overflow-hidden select-none ${
            isLight ? 'bg-slate-200/80 border-b-2 border-slate-300 text-slate-900' : 'bg-[#0f172a] border-slate-700 text-slate-300'
          }`}>
            {/* Left Brand Title */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/90 inline-block shrink-0"></span>
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/90 inline-block shrink-0"></span>
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-emerald-500/90 inline-block shrink-0"></span>
              <span className={`ml-0.5 sm:ml-1.5 text-[11px] sm:text-xs font-bold flex items-center gap-1 shrink-0 ${
                isLight ? 'text-slate-900' : 'text-slate-200'
              }`}>
                <Terminal className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                <span className="truncate max-w-[100px] xs:max-w-[140px] sm:max-w-none">tfc-biometric-monitor</span>
              </span>
            </div>

            {/* Right Status Controls */}
            <div className="flex items-center gap-1.5 sm:gap-3 text-[10px] sm:text-[11px] shrink-0">
              {isCheckingStatus ? (
                <span className={`inline-flex items-center justify-center p-1 sm:px-2.5 sm:py-0.5 rounded sm:border shadow-none text-[9px] sm:text-[11px] ${
                  isLight ? 'bg-transparent sm:bg-white text-amber-700 sm:border-slate-300' : 'text-amber-400 sm:bg-amber-950/80 sm:border-amber-700/80'
                }`} title="FETCHING DEVICE STATUS...">
                  <RotateCw className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin shrink-0" />
                  <span className="hidden sm:inline ml-1 font-bold">FETCHING...</span>
                </span>
              ) : deviceInfo && deviceInfo.isConnected ? (
                <span className={`inline-flex items-center gap-1 font-bold p-1 sm:px-2 sm:py-0.5 rounded sm:border shadow-none text-[9px] sm:text-[11px] ${
                  isLight ? 'bg-transparent sm:bg-white text-emerald-700 sm:border-slate-300' : 'text-emerald-400 sm:bg-emerald-950/80 sm:border-emerald-700/80'
                }`} title={`ONLINE [${deviceInfo.model || 'DS-K1T320EFWX'}]`}>
                  <span className="w-2.5 h-2.5 rounded-full animate-sharp-blink bg-emerald-500 shrink-0"></span>
                  <span className="hidden sm:inline">ONLINE [{deviceInfo.model || 'DS-K1T320EFWX'}]</span>
                </span>
              ) : (
                <span className={`inline-flex items-center gap-1 font-bold p-1 sm:px-2 sm:py-0.5 rounded sm:border shadow-none text-[9px] sm:text-[11px] ${
                  isLight ? 'bg-transparent sm:bg-white text-red-700 sm:border-slate-300' : 'text-red-400 sm:bg-red-950/80 sm:border-red-700/80'
                }`} title="OFFLINE">
                  <span className="w-2.5 h-2.5 rounded-full animate-sharp-blink bg-red-500 shrink-0"></span>
                  <span className="hidden sm:inline">OFFLINE</span>
                </span>
              )}
              
              <span className={`text-slate-400 ${isLight ? 'text-slate-400 font-bold' : ''}`}>|</span>
              
              {/* Interactive Toggle Switch Slider Component */}
              <div 
                className="flex items-center gap-1 cursor-pointer select-none group" 
                onClick={handleThemeToggle}
                title="Toggle Light / Dark Theme"
              >
                <div
                  role="switch"
                  aria-checked={isLight}
                  className={`relative inline-flex h-4 w-8 sm:h-5 sm:w-10 flex-shrink-0 cursor-pointer rounded-full border transition-colors duration-300 ease-in-out ${
                    isLight ? 'bg-amber-100 border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-3.5 w-3.5 sm:h-4 sm:w-4 transform rounded-full shadow-md transition duration-300 ease-in-out flex items-center justify-center ${
                      isLight
                        ? 'translate-x-3.5 sm:translate-x-4.5 bg-white border border-slate-300 text-amber-500'
                        : 'translate-x-0 bg-slate-950 border border-slate-700 text-sky-400'
                    }`}
                  >
                    {isLight ? (
                      <Sun className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-amber-500" />
                    ) : (
                      <Moon className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-sky-400" />
                    )}
                  </span>
                </div>
              </div>

              <span className={`text-slate-400 ${isLight ? 'text-slate-400 font-bold' : ''}`}>|</span>

              {/* Standalone Settings Gear Icon Link */}
              <Link
                href="/onboard"
                title="Onboard & Active Employee Settings"
                className="p-0.5 cursor-pointer transition-transform hover:rotate-90 duration-300 active:scale-95 flex items-center justify-center shrink-0"
              >
                <Settings className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isLight ? 'text-slate-800 hover:text-emerald-700' : 'text-emerald-400 hover:text-emerald-300'}`} />
              </Link>
            </div>
          </div>

          {/* ASCII Banner & System Specs */}
          <div className="p-2 sm:p-6 space-y-3 sm:space-y-5 w-full max-w-full overflow-hidden">
            {/* Rotating Single-Line Title Header */}
            <div className="py-2 px-1 border-b-2 border-emerald-500/30 flex items-center justify-between min-h-[2.6rem] sm:min-h-[3.2rem] w-full max-w-full overflow-hidden">
              <div className="flex items-center gap-1.5 sm:gap-2 font-mono select-none overflow-hidden max-w-full">
                <span className={`text-xs xs:text-sm sm:text-2xl md:text-3xl font-black tracking-tight sm:tracking-wider truncate max-w-[calc(100vw-3.5rem)] sm:max-w-none ${
                  isLight ? 'text-emerald-700 font-black' : 'text-emerald-400 text-glow-green'
                }`}>
                  {typedSingleTitle}
                </span>
                <span className="terminal-cursor w-1.5 h-4 sm:w-3 sm:h-7 shrink-0" />
              </div>

              <div className="hidden md:flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2.5 py-1 rounded border-2 ${
                  isLight ? 'bg-emerald-50 text-emerald-900 border-slate-300' : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80'
                }`}>
                  v2.0 LIVE
                </span>
              </div>
            </div>

            {/* System Diagnostic Specs Strip */}
            <div className="grid grid-cols-2 sm:flex sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-1 text-[10px] sm:text-xs w-full">
              <div className="font-bold flex items-center gap-1 min-w-0">
                <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                <span className={`truncate ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                  MODEL: {deviceInfo?.model || 'DS-K1T320EFWX'}
                </span>
              </div>
              
              <div className="font-bold flex items-center gap-1 min-w-0 justify-end sm:justify-start">
                <Wifi className={`w-3 h-3 animate-pulse shrink-0 ${isLight ? 'text-sky-700' : 'text-sky-400'}`} />
                <span className={`truncate ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                  IP: {deviceIp}
                </span>
              </div>

              <div className="font-bold flex items-center gap-1 min-w-0">
                <Cpu className={`w-3 h-3 shrink-0 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
                <span className={`truncate ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>
                  FW: {deviceInfo?.firmwareVersion || 'V3.5.2'}
                </span>
              </div>
              
              <div className="font-bold min-w-0 text-right sm:text-left">
                DATE: <span className={isLight ? 'text-emerald-700 font-bold' : 'text-emerald-300'}>{todayDate || 'FETCHING...'}</span>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
              <div className={`p-2.5 sm:p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>TOTAL ACTIVE USERS</div>
                <div className={`text-xl sm:text-2xl font-bold mt-1 text-emerald-400 ${isLight ? 'text-emerald-700' : 'text-glow-green'}`}>
                  {totalActiveUsers}
                </div>
                <div className={`text-[9px] sm:text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Active Onboarded Users</div>
              </div>

              <div className={`p-2.5 sm:p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>PRESENT EMPLOYEES</div>
                <div className={`text-xl sm:text-2xl font-bold mt-1 text-sky-400 ${isLight ? 'text-sky-700' : 'text-glow-cyan'}`}>
                  {presentUsersCount}
                </div>
                <div className={`text-[9px] sm:text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Punched in Filter</div>
              </div>

              <div className={`p-2.5 sm:p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>ATTENDANCE RATE</div>
                <div className={`text-xl sm:text-2xl font-bold mt-1 text-amber-400 flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-glow-amber'}`}>
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span>{attendanceRate}%</span>
                </div>
                <div className={`text-[9px] sm:text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{presentUsersCount}/{totalActiveUsers} Present</div>
              </div>

              <div className={`p-2.5 sm:p-3 border-2 rounded shadow-none ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>TOTAL PUNCHES</div>
                <div className={`text-xl sm:text-2xl font-bold mt-1 ${isLight ? 'text-sky-700' : 'text-sky-400 text-glow-cyan'}`}>{filteredRecords.length}</div>
                <div className={`text-[9px] sm:text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Raw Log Entries</div>
              </div>

              <div className={`p-2.5 sm:p-3 border-2 rounded shadow-none col-span-2 sm:col-span-1 ${
                isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0c1220] border-slate-700/90'
              }`}>
                <div className={`text-[9px] sm:text-[10px] uppercase tracking-wider font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>LIVE IST CLOCK</div>
                <div className={`text-xs sm:text-base font-bold mt-1 truncate flex items-center gap-1 ${isLight ? 'text-amber-700' : 'text-amber-400 text-glow-amber'}`}>
                  <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                  <span className="truncate">{currentTime || '00:00:00 AM'}</span>
                </div>
                <div className={`text-[9px] sm:text-[10px] font-medium truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Poll: {lastSyncTime}</div>
              </div>
            </div>

            {/* CLI Command Bar & Controls */}
            <div className={`border-2 p-2 sm:p-3 rounded space-y-2 sm:space-y-3 shadow-none ${
              isLight ? 'bg-[#f8fafc] border-slate-300 text-slate-900' : 'bg-[#0c121e] border-slate-700/90'
            }`}>
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 sm:gap-3">
                
                {/* Search Bar Input */}
                <div className={`flex-1 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded border-2 ${
                  isLight ? 'bg-white border-slate-300 focus-within:border-slate-400 shadow-none' : 'bg-slate-950 border-slate-700 focus-within:border-sky-400'
                }`}>
                  <Search className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-slate-700' : 'text-slate-400'}`} />
                  <span className={`font-bold text-[10px] sm:text-xs select-none shrink-0 hidden sm:inline ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                    root@axom-server:~# grep=
                  </span>
                  <input
                    type="text"
                    placeholder="Search name or ID..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className={`flex-1 bg-transparent border-none text-[11px] sm:text-xs focus:outline-none font-mono font-bold min-w-0 ${
                      isLight ? 'text-slate-900 placeholder-slate-400' : 'text-sky-200 placeholder-slate-600'
                    }`}
                  />
                  {search && (
                    <button
                      onClick={() => handleSearchChange('')}
                      className="text-[10px] text-slate-400 hover:text-slate-600 px-1 font-bold shrink-0"
                      title="Clear Search"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Command Action Buttons */}
                <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2">
                  <button
                    onClick={scanLocalNetwork}
                    disabled={isScanning}
                    className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded border-2 text-[10px] sm:text-xs font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap ${
                      isLight
                        ? 'bg-white border-slate-300 text-sky-800 hover:bg-slate-100'
                        : 'bg-sky-950/80 border-sky-500/50 text-sky-300 hover:bg-sky-900/60'
                    }`}
                  >
                    <Radar className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${isScanning ? 'animate-spin text-amber-500' : isLight ? 'text-sky-700' : 'text-sky-400'}`} />
                    <span>{isScanning ? 'Scan...' : './scan'}</span>
                  </button>

                  <button
                    onClick={triggerManualSync}
                    disabled={isSyncing}
                    className={`flex items-center justify-center gap-1 px-2 sm:px-3 py-1.5 rounded border-2 text-[10px] sm:text-xs font-bold transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap ${
                      isLight
                        ? 'bg-white border-slate-300 text-emerald-800 hover:bg-slate-100'
                        : 'bg-emerald-950/80 border-emerald-500/50 text-emerald-400 hover:bg-emerald-900/60'
                    }`}
                  >
                    <RotateCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 ${isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
                    <span>{isSyncing ? 'Sync...' : './sync'}</span>
                  </button>

                  <button
                    onClick={handleAutoPollToggle}
                    className={`flex items-center justify-center px-2 sm:px-3 py-1.5 rounded border-2 text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap ${
                      offlinePauseState.isPaused
                        ? isLight
                          ? 'bg-amber-100 border-amber-400 text-amber-900 animate-pulse'
                          : 'bg-amber-950 border-amber-600 text-amber-300 animate-pulse'
                        : isAutoPoll
                        ? isLight
                          ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                        : 'bg-red-950 border-red-800 text-red-400'
                    }`}
                    title={offlinePauseState.isPaused ? `Auto-scan paused until ${offlinePauseState.pauseUntilStr}. Click to reset and retry.` : ''}
                  >
                    {offlinePauseState.isPaused
                      ? `PAUSED (${offlinePauseState.minsLeft}m)`
                      : isAutoPoll
                      ? 'POLL: ON'
                      : 'POLL: OFF'}
                  </button>
                </div>
              </div>
            </div>

            {/* View Mode & Date Filter Toggle Header */}
            <div className={`flex flex-col md:flex-row items-stretch md:items-center justify-between px-2 sm:px-4 py-2 border-2 rounded-t border-b-0 text-xs gap-2.5 sm:gap-2 ${
              isLight ? 'bg-slate-200/80 border-slate-300 text-slate-900 font-bold' : 'bg-[#0b101c] border-slate-700/90 text-slate-300'
            }`}>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
                
                {/* View Mode Buttons (50-50 on mobile, flex on sm) */}
                <div className="grid grid-cols-2 sm:flex items-center gap-1.5 w-full sm:w-auto">
                  <button
                    onClick={() => handleViewModeChange('SUMMARY')}
                    className={`flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-1 rounded font-bold transition-all text-[11px] sm:text-xs ${
                      viewMode === 'SUMMARY'
                        ? isLight
                          ? 'bg-emerald-600 text-white border-2 border-emerald-700'
                          : 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20 border border-emerald-400'
                        : isLight
                        ? 'bg-white text-slate-900 border-2 border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>[SUMMARY]</span>
                  </button>

                  <button
                    onClick={() => handleViewModeChange('RAW')}
                    className={`flex items-center justify-center gap-1 px-2.5 sm:px-3 py-1.5 sm:py-1 rounded font-bold transition-all text-[11px] sm:text-xs ${
                      viewMode === 'RAW'
                        ? isLight
                          ? 'bg-sky-600 text-white border-2 border-sky-700'
                          : 'bg-sky-500 text-black shadow-md shadow-sky-500/20 border border-sky-400'
                        : isLight
                        ? 'bg-white text-slate-900 border-2 border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-2 border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <ListFilter className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>[RAW LOGS]</span>
                  </button>
                </div>

                <span className="text-slate-400 hidden sm:inline">|</span>

                {/* Date Navigator Bar: PREV | DATE PICKER | NEXT */}
                <div className="flex items-center justify-between gap-1.5 w-full sm:w-auto">
                  {/* Standalone Previous Day Button */}
                  <button
                    onClick={() => handleShiftDay(-1)}
                    title="Previous Day"
                    className={`flex items-center justify-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded border-2 font-bold text-[10px] sm:text-xs transition-all active:scale-95 shrink-0 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-sky-950/60 hover:border-sky-500/50'
                    }`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                    <span>PREV</span>
                  </button>

                  {/* Main Date Display Badge Popover Anchor */}
                  <div className="relative flex-1 sm:flex-initial">
                    <button
                      onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                      className={`flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 sm:py-1 rounded border-2 transition-all font-mono font-bold text-[10px] sm:text-xs active:scale-95 w-full sm:w-auto truncate ${
                        isLight
                          ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 border-slate-300'
                          : 'bg-emerald-950/80 text-emerald-400 hover:bg-emerald-900/60 border-emerald-500/50 shadow-md shadow-emerald-950/40'
                      }`}
                    >
                      <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{formatCustomDateLabel(startDate, endDate)}</span>
                      <ChevronDown className={`w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 transition-transform duration-200 ${isCalendarOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Custom Calendar Dropdown Modal */}
                    {isCalendarOpen && (
                      <div className={`absolute left-0 sm:left-auto right-0 sm:right-auto mt-2 z-50 p-2.5 sm:p-3 rounded-lg border-2 shadow-2xl w-[calc(100vw-2rem)] sm:w-80 max-w-sm transition-all font-mono ${
                        isLight
                          ? 'bg-white border-slate-300 text-slate-900 shadow-none'
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

                        {/* Presets: TODAY / YESTERDAY / 3 DAYS / 7 DAYS */}
                        <div className="flex gap-1 mb-2.5">
                          <button
                            onClick={() => {
                              const now = new Date();
                              const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                              setStartDate(iso);
                              setEndDate(iso);
                              setIsCalendarOpen(false);
                            }}
                            className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isLight
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-400 hover:bg-emerald-100'
                                : 'bg-emerald-950/80 text-emerald-400 border-emerald-700/80 hover:bg-emerald-900'
                            }`}
                          >
                            [TODAY]
                          </button>
                          <button
                            onClick={() => {
                              const now = new Date();
                              const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                              const iso = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
                              setStartDate(iso);
                              setEndDate(iso);
                              setIsCalendarOpen(false);
                            }}
                            className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isLight
                                ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                            }`}
                          >
                            [YEST]
                          </button>
                          <button
                            onClick={() => {
                              const now = new Date();
                              const endIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                              const threeAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                              const startIso = `${threeAgo.getFullYear()}-${String(threeAgo.getMonth() + 1).padStart(2, '0')}-${String(threeAgo.getDate()).padStart(2, '0')}`;
                              setStartDate(startIso);
                              setEndDate(endIso);
                              setIsCalendarOpen(false);
                            }}
                            className={`flex-1 py-1 rounded text-[10px] font-bold border transition-colors ${
                              isLight
                                ? 'bg-amber-50 text-amber-800 border-amber-400 hover:bg-amber-100'
                                : 'bg-amber-950/80 text-amber-300 border-amber-700/80 hover:bg-amber-900'
                            }`}
                          >
                            [3 DAYS]
                          </button>
                          <button
                            onClick={() => {
                              const now = new Date();
                              const endIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                              const sevenAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                              const startIso = `${sevenAgo.getFullYear()}-${String(sevenAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenAgo.getDate()).padStart(2, '0')}`;
                              setStartDate(startIso);
                              setEndDate(endIso);
                              setIsCalendarOpen(false);
                            }}
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
                    className={`flex items-center justify-center gap-0.5 sm:gap-1 px-2 sm:px-2.5 py-1.5 sm:py-1 rounded border-2 font-bold text-[10px] sm:text-xs transition-all active:scale-95 shrink-0 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'
                        : 'bg-slate-900 border-slate-700 text-sky-400 hover:bg-sky-950/60 hover:border-sky-500/50'
                    }`}
                  >
                    <span>NEXT</span>
                    <ChevronRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  </button>
                </div>
              </div>

              <div className="text-[11px] font-bold hidden md:block">
                {viewMode === 'SUMMARY'
                  ? `EMPLOYEES: ${groupedList.length} UNIQUE USER(S)`
                  : `RAW PUNCHES: ${filteredRecords.length} ENTRIES`}
              </div>
            </div>

            {/* Terminal Table Display */}
            <div className={`border-2 rounded-b overflow-hidden ${
              isLight ? 'bg-white border-slate-300 text-slate-900 shadow-none' : 'bg-[#070b14] border-slate-700/90'
            }`}>
              
              {viewMode === 'SUMMARY' ? (
                /* GROUPED CHECK-IN / CHECK-OUT TABLE */
                <div className="overflow-x-auto touch-manipulation scrollbar-thin">
                  <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
                    <thead className={`border-b-2 select-none ${
                      isLight ? 'bg-slate-100 text-slate-900 border-slate-300 font-bold' : 'bg-[#090e1a] text-slate-300 border-slate-700'
                    }`}>
                      <tr>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300 text-amber-700' : 'border-slate-700 text-amber-400'}`}>#</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>EMPLOYEE_ID</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>USER_NAME</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>ATTENDANCE_DATE</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300 text-emerald-700' : 'border-slate-700 text-emerald-400'}`}>
                          <span className="flex items-center gap-1">
                            <LogIn className="w-3.5 h-3.5" /> CHECK-IN (FIRST ENTRY)
                          </span>
                        </th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300 text-sky-700' : 'border-slate-700 text-sky-400'}`}>
                          <span className="flex items-center gap-1">
                            <LogOut className="w-3.5 h-3.5" /> CHECK-OUT (LAST ENTRY)
                          </span>
                        </th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>PUNCH_COUNT</th>
                        <th className="py-2 sm:py-2.5 px-2 sm:px-3 font-bold">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y border-t ${
                      isLight ? 'border-slate-300 divide-slate-200' : 'border-slate-700/80 divide-slate-800'
                    }`}>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-slate-200 text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-emerald-500" />
                              <span className="font-mono">EXEC: fetching attendance records for [{formatCustomDateLabel(startDate, endDate)}]...</span>
                            </div>
                          </td>
                        </tr>
                      ) : groupedList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-slate-200 text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO ATTENDANCE RECORDS FOUND FOR {formatCustomDateLabel(startDate, endDate)}]
                          </td>
                        </tr>
                      ) : (
                        groupedList.map((item, idx) => (
                          <tr
                            key={`${item.employee_id}_${item.attendance_date}`}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
                            <td className={`py-2.5 px-3 border-r font-bold ${
                              isLight ? 'border-slate-200 text-amber-700' : 'border-slate-800/80 text-amber-400'
                            }`}>
                              #{idx + 1}
                            </td>
                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                  : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80'
                              }`}>
                                {item.employee_id}
                              </span>
                            </td>
                            <td className={`py-2.5 px-3 border-r font-bold ${
                              isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800/80 text-white group-hover:text-sky-300'
                            }`}>
                              {item.user_name}
                            </td>
                            <td className={`py-2.5 px-3 border-r font-medium ${
                              isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800/80 text-slate-300'
                            }`}>
                              {item.attendance_date}
                            </td>
                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                              {item.has_punched ? (
                                <span className={`font-bold px-2 py-1 rounded border inline-flex items-center gap-1 ${
                                  isLight
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                    : 'text-emerald-300 bg-emerald-950/90 border-emerald-700/80'
                                }`}>
                                  <LogIn className={`w-3 h-3 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                                  {item.check_in_time}
                                </span>
                              ) : (
                                <span className={`font-medium px-2.5 py-0.5 rounded border inline-block ${
                                  isLight ? 'text-slate-400 bg-slate-100 border-slate-200' : 'text-slate-500 bg-slate-900/60 border-slate-800'
                                }`}>
                                  --
                                </span>
                              )}
                            </td>

                            <td className={`py-2.5 px-3 border-r ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                              {item.has_punched ? (
                                item.check_out_time !== '--' ? (
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
                                )
                              ) : (
                                <span className={`font-medium px-2.5 py-0.5 rounded border inline-block ${
                                  isLight ? 'text-slate-400 bg-slate-100 border-slate-200' : 'text-slate-500 bg-slate-900/60 border-slate-800'
                                }`}>
                                  --
                                </span>
                              )}
                            </td>

                            <td className={`py-2.5 px-3 border-r font-bold ${
                              item.has_punched
                                ? isLight
                                  ? 'border-slate-200 text-amber-700'
                                  : 'border-slate-800/80 text-amber-400'
                                : 'border-slate-200 text-slate-500 font-normal'
                            }`}>
                              {item.total_punches} {item.total_punches === 1 ? 'Punch' : 'Punches'}
                            </td>

                            <td className="py-2.5 px-3">
                              {item.has_punched ? (
                                item.check_out_time !== '--' ? (
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
                                )
                              ) : (
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                                  isLight ? 'text-slate-500 bg-slate-100 border-slate-300' : 'text-slate-500 bg-slate-900/60 border-slate-800'
                                }`}>
                                  NOT PUNCHED
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
                <div className="overflow-x-auto touch-manipulation scrollbar-thin">
                  <table className="w-full text-left text-xs font-mono border-collapse whitespace-nowrap">
                    <thead className={`border-b-2 select-none ${
                      isLight ? 'bg-slate-100 text-slate-900 border-slate-300 font-bold' : 'bg-[#090e1a] text-slate-300 border-slate-700'
                    }`}>
                      <tr>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300 text-amber-700' : 'border-slate-700 text-amber-400'}`}>#</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>SERIAL</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>EMPLOYEE_ID</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>USER_NAME</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>DATE</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>PUNCH_TIME</th>
                        <th className={`py-2 sm:py-2.5 px-2 sm:px-3 border-r-2 font-bold ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>ATN_TOKEN</th>
                        <th className="py-2 sm:py-2.5 px-2 sm:px-3 font-bold">ENTRY_ID</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y border-t ${
                      isLight ? 'border-slate-300 divide-slate-200' : 'border-slate-700/80 divide-slate-800'
                    }`}>
                      {loading ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-slate-200 text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            <div className="flex items-center justify-center gap-2">
                              <RotateCw className="w-4 h-4 animate-spin text-sky-500" />
                              <span className="font-mono">EXEC: fetching raw attendance punches for [{formatCustomDateLabel(startDate, endDate)}]...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={8} className={`py-8 text-center border ${isLight ? 'border-slate-200 text-slate-600 font-bold' : 'border-slate-800 text-slate-500'}`}>
                            [NO RAW PUNCH RECORDS FOUND FOR {formatCustomDateLabel(startDate, endDate)}]
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((item, idx) => (
                          <tr
                            key={item.entry_id}
                            className={`border-b transition-colors group ${
                              isLight ? 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-900' : 'hover:bg-sky-950/40 border-slate-800/80'
                            }`}
                          >
                            <td className={`py-2 px-3 border-r font-bold ${
                              isLight ? 'border-slate-200 text-amber-700' : 'border-slate-800/80 text-amber-400'
                            }`}>
                              #{idx + 1}
                            </td>
                            <td className={`py-2 px-3 border-r font-semibold ${
                              isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800/80 text-slate-400'
                            }`}>
                              #{item.serial_no}
                            </td>
                            <td className={`py-2 px-3 border-r ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-400'
                                  : 'text-emerald-400 bg-emerald-950/80 border-emerald-800/80'
                              }`}>
                                {item.employee_id}
                              </span>
                            </td>
                            <td className={`py-2 px-3 border-r font-bold ${
                              isLight ? 'border-slate-200 text-slate-900' : 'border-slate-800/80 text-white group-hover:text-sky-300'
                            }`}>
                              {item.user_name}
                            </td>
                            <td className={`py-2 px-3 border-r font-medium ${
                              isLight ? 'border-slate-200 text-slate-700' : 'border-slate-800/80 text-slate-300'
                            }`}>
                              {item.attendance_date}
                            </td>
                            <td className={`py-2 px-3 border-r ${isLight ? 'border-slate-200' : 'border-slate-800/80'}`}>
                              <span className={`font-bold px-1.5 py-0.5 rounded border ${
                                isLight
                                  ? 'text-sky-700 bg-sky-50 border-sky-400'
                                  : 'text-sky-300 bg-sky-950/80 border-sky-800/80'
                              }`}>
                                {item.attendance_time}
                              </span>
                            </td>
                            <td className={`py-2 px-3 border-r ${
                              isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800/80 text-slate-400'
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
