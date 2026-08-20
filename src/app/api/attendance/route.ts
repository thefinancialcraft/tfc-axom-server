import { NextResponse } from 'next/server';
import {
  getSupabaseClient,
  getLocalJsonRecords,
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
    // Non-blocking automatic machine sync trigger every 2.5 seconds
    if (nowTs - lastAutoSyncTime > 2500) {
      lastAutoSyncTime = nowTs;
      syncHikvisionAttendance().catch((err) => {
        console.warn('Background auto-sync exception:', err.message);
      });
    }

    const supabase = getSupabaseClient();
    const localRecords = getLocalJsonRecords();
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

    let records: any[] = [...localRecords];

    if (supabase) {
      try {
        const { data: supaData } = await supabase
          .from('attendance_log')
          .select('*')
          .order('serial_no', { ascending: false })
          .limit(500);

        if (supaData && supaData.length > 0) {
          const existingIds = new Set(records.map((r) => r.entry_id));
          for (const sRow of supaData) {
            if (!existingIds.has(sRow.entry_id)) {
              records.push(sRow);
            }
          }
        }
      } catch (sErr: any) {
        console.warn('Supabase fetch notice:', sErr.message);
      }
    }

    // Format all records to 12-Hour AM/PM format
    records = records.map((r) => ({
      ...r,
      attendance_time: formatTo12Hour(r.attendance_time),
    }));

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
