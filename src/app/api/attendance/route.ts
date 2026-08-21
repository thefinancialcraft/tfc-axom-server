import { NextResponse } from 'next/server';
import {
  getSupabaseClient,
  formatTo12Hour,
  syncHikvisionAttendance,
  getHikvisionDeviceInfo,
  fetchHikvisionEvents,
  parseHikvisionEventTime
} from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

let lastAutoSyncTime = 0;

export async function GET() {
  try {
    const nowTs = Date.now();
    // Non-blocking automatic machine sync trigger every 2.5 seconds
    if (nowTs - lastAutoSyncTime > 2500) {
      lastAutoSyncTime = nowTs;
      syncHikvisionAttendance().catch((err) => {
        console.warn('Background auto-sync exception:', err.message);
      });
    }

    const supabase = getSupabaseClient();
    const deviceInfo = await getHikvisionDeviceInfo();

    const now = new Date();
    
    // Format Today's Date in IST (Asia/Kolkata)
    const formatterShort = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    const todayStr = formatterShort.format(now); // e.g. "20/08/26"

    const formatterFull = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const todayStrFull = formatterFull.format(now); // e.g. "20/08/2026"

    let records: any[] = [];

    // 1. Fetch live events directly from Hikvision Machine
    try {
      const hikRes = await fetchHikvisionEvents();
      if (hikRes?.data?.AcsEvent?.InfoList && Array.isArray(hikRes.data.AcsEvent.InfoList)) {
        for (const event of hikRes.data.AcsEvent.InfoList) {
          if (event.major !== 5 || event.minor !== 38) continue;
          const employeeNo = (event.employeeNoString || '').trim();
          const userName = (event.name || '').trim();

          if (!employeeNo || employeeNo === '--' || employeeNo.toLowerCase() === 'invalid' || !userName) {
            continue;
          }

          const numericCode = employeeNo.replace(/[^0-9]/g, '');
          if (!numericCode) continue;

          const serial = parseInt(event.serialNo || '0', 10);
          const parsedTime = parseHikvisionEventTime(event.time);
          const YYYY = new Date(event.time).getFullYear();
          const MM = parsedTime.month;
          const DD = parsedTime.day;
          const hh = String(new Date(event.time).getHours()).padStart(2, '0');
          const mm = String(new Date(event.time).getMinutes()).padStart(2, '0');
          const ss = String(new Date(event.time).getSeconds()).padStart(2, '0');
          const dateStamp = `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
          
          const entry_id = `T${dateStamp}${numericCode}${serial}`;
          const atn_token = `${parsedTime.yearShort}${MM}${DD}${numericCode}`;
          const employee_id = employeeNo.replace(/([A-Za-z]+)([0-9]+)/, '$1-$2');

          records.push({
            entry_id,
            atn_token,
            employee_id,
            user_name: userName,
            attendance_date: parsedTime.dateStr,
            attendance_time: parsedTime.timeStr12,
            serial_no: serial,
          });
        }
      }
    } catch (hikErr: any) {
      console.warn('Direct machine event fetch notice:', hikErr.message);
    }

    // 2. Fetch records from Supabase Cloud DB if available
    if (supabase) {
      try {
        const { data: supaData } = await supabase
          .from('attendance_log')
          .select('*')
          .limit(500);

        if (supaData && supaData.length > 0) {
          const existingIds = new Set(records.map((r) => r.entry_id));
          for (const sRow of supaData) {
            if (!existingIds.has(sRow.entry_id)) {
              records.push({
                ...sRow,
                attendance_time: formatTo12Hour(sRow.attendance_time),
              });
            }
          }
        }
      } catch (sErr: any) {
        console.warn('Supabase fetch notice:', sErr.message);
      }
    }

    // Sort by serial_no descending
    records.sort((a, b) => (b.serial_no || 0) - (a.serial_no || 0));

    // Filter today's records if available, otherwise return all historical records
    const todayRecords = records.filter(
      (r) => r.attendance_date === todayStr || r.attendance_date === todayStrFull
    );

    const finalRecords = todayRecords.length > 0 ? todayRecords : records;

    return NextResponse.json({
      success: true,
      todayDate: todayStrFull,
      total: finalRecords.length,
      records: finalRecords || [],
      deviceInfo,
    });
  } catch (error: any) {
    console.error('API Attendance fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message, total: 0, records: [] },
      { status: 500 }
    );
  }
}
