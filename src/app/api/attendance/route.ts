import { NextResponse } from 'next/server';
import {
  getSupabaseClient,
  formatTo12Hour,
  syncHikvisionAttendance,
  getHikvisionDeviceInfo
} from '@/lib/hikvision';


export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

let lastAutoSyncTime = 0;

export async function GET() {
  try {
    const nowTs = Date.now();
    // 1. Background Parallel Sync: Machine -> Supabase Cloud DB & Google Sheets (every 2.5s)
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

    // 2. Pure Supabase Cloud DB Query: UI displays data directly from Supabase Cloud
    if (supabase) {
      try {
        const { data: supaData, error: supaErr } = await supabase
          .from('attendance_log')
          .select('*')
          .limit(1000);

        if (supaErr) {
          console.error('Supabase query error:', supaErr.message);
        } else if (supaData && supaData.length > 0) {
          records = supaData.map((sRow) => ({
            ...sRow,
            attendance_time: formatTo12Hour(sRow.attendance_time),
          }));
        }
      } catch (sErr: any) {
        console.warn('Supabase fetch notice:', sErr.message);
      }
    }

    // Sort by entry_id / serial_no descending so latest punches appear first
    records.sort((a, b) => {
      const sA = a.serial_no || 0;
      const sB = b.serial_no || 0;
      if (sA !== sB) return sB - sA;
      return (b.entry_id || '').localeCompare(a.entry_id || '');
    });

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
