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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date'); // e.g. "TODAY", "ALL", "2026-08-21"

    const nowTs = Date.now();
    
    // 1. Non-blocking Machine Sync: trigger in background so Supabase fetch returns INSTANTLY
    if (nowTs - lastAutoSyncTime > 3000) {
      lastAutoSyncTime = nowTs;
      syncHikvisionAttendance().catch((syncErr) => {
        console.warn('Background sync warning:', syncErr.message);
      });
    }

    const supabase = getSupabaseClient();
    const deviceInfo = await getHikvisionDeviceInfo();

    const now = new Date();
    
    // Format Today's Date in IST (Asia/Kolkata) - Multiple format variations
    const formatterShort = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    const todayStr = formatterShort.format(now); // e.g. "21/08/26"

    const formatterFull = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const todayStrFull = formatterFull.format(now); // e.g. "21/08/2026"

    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const DD = String(now.getDate()).padStart(2, '0');
    const todayStrIso = `${YYYY}-${MM}-${DD}`; // e.g. "2026-08-21"

    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    // Construct SQL date filter array if a specific date, date range, or TODAY is requested
    let filterDateValues: string[] = [];

    if (startDateParam && endDateParam) {
      const startParts = startDateParam.split('-').map(Number);
      const endParts = endDateParam.split('-').map(Number);
      if (startParts.length === 3 && endParts.length === 3) {
        const start = new Date(startParts[0], startParts[1] - 1, startParts[2]);
        const end = new Date(endParts[0], endParts[1] - 1, endParts[2]);
        const minDate = start < end ? start : end;
        const maxDate = start > end ? start : end;

        const curr = new Date(minDate);
        while (curr <= maxDate) {
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, '0');
          const d = String(curr.getDate()).padStart(2, '0');
          const shortY = String(y).slice(-2);
          
          filterDateValues.push(`${d}/${m}/${y}`, `${d}/${m}/${shortY}`, `${y}-${m}-${d}`);
          curr.setDate(curr.getDate() + 1);
        }
      }
    }

    if (filterDateValues.length === 0) {
      if (!dateParam || dateParam === 'TODAY' || dateParam === todayStrIso) {
        filterDateValues = [todayStrFull, todayStr, todayStrIso];
      } else if (dateParam && dateParam !== 'ALL') {
        const parts = dateParam.split('-');
        if (parts.length === 3) {
          const [y, m, d] = parts;
          const shortY = y.slice(-2);
          filterDateValues = [`${d}/${m}/${y}`, `${d}/${m}/${shortY}`, dateParam];
        } else {
          filterDateValues = [dateParam];
        }
      }
    }

    let records: any[] = [];

    // 2. Query Supabase Cloud DB directly using SQL date filter + range pagination
    if (supabase) {
      try {
        let allSupaRows: any[] = [];
        let from = 0;
        const step = 1000;

        while (true) {
          let query = supabase.from('attendance_log').select('*');

          if (filterDateValues.length > 0) {
            query = query.in('attendance_date', filterDateValues);
          }

          const { data: chunk, error: supaErr } = await query
            .order('id', { ascending: false })
            .range(from, from + step - 1);

          if (supaErr) {
            console.error('Supabase query error:', supaErr.message);
            break;
          }

          if (!chunk || chunk.length === 0) break;

          allSupaRows = allSupaRows.concat(chunk);
          if (chunk.length < step) break;
          from += step;
        }

        if (allSupaRows.length > 0) {
          records = allSupaRows.map((sRow) => ({
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

    // Filter today's records matching any date format variation (DD/MM/YY, DD/MM/YYYY, YYYY-MM-DD)
    const todayRecords = records.filter((r) => {
      if (!r.attendance_date) return false;
      const d = r.attendance_date.trim();
      return (
        d === todayStr ||
        d === todayStrFull ||
        d === todayStrIso ||
        (r.created_at && new Date(r.created_at).toISOString().slice(0, 10) === todayStrIso)
      );
    });

    return NextResponse.json({
      success: true,
      todayDate: todayStrFull,
      total: records.length,
      todayTotal: todayRecords.length,
      records,
      todayRecords,
      deviceInfo,
    });
  } catch (error: any) {
    console.error('API Attendance fetch error:', error);
    return NextResponse.json(
      { success: false, error: error.message, total: 0, todayTotal: 0, records: [], todayRecords: [] },
      { status: 500 }
    );
  }
}
