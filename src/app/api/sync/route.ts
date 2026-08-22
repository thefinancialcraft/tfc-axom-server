import { NextResponse } from 'next/server';
import { syncHikvisionAttendance, getSupabaseClient, formatTo12Hour } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deep = searchParams.get('deep') === 'true';

    // 1. Attempt Machine Sync (if on office Wi-Fi / IP 192.168.1.63 accessible)
    const machineResult = await syncHikvisionAttendance(deep);

    // 2. If Machine is Connected, return Machine Sync result directly
    if (machineResult.success && machineResult.isConnected) {
      return NextResponse.json(machineResult);
    }

    // 3. If Machine is Offline / Inaccessible (outside office Wi-Fi), accurately return isConnected: false & load Supabase Cloud DB
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, isConnected: false, records: [] });
    }

    const { data: rows } = await supabase
      .from('attendance_log')
      .select('*')
      .order('id', { ascending: false })
      .limit(1000);

    const records = (rows || []).map((r) => ({
      ...r,
      attendance_time: formatTo12Hour(r.attendance_time),
    }));

    return NextResponse.json({
      success: true,
      isConnected: false, // Accurately returns isConnected: false when outside office Wi-Fi!
      records,
      newRecordsInserted: 0,
      deviceIp: '192.168.1.63',
      deviceInfo: {
        isConnected: false,
        ip: '192.168.1.63',
        model: 'DS-K1T320EFWX',
        deviceName: 'Access Controller',
        serialNumber: 'DS-K1T320EFWX20240701V030502ENFS1267085',
        macAddress: 'a4:d5:c2:1c:4d:83',
        firmwareVersion: 'V3.5.2',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, isConnected: false, error: err.message, records: [] });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
