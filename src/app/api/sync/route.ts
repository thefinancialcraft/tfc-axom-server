import { NextResponse } from 'next/server';
import { getSupabaseClient, formatTo12Hour } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client unavailable' }, { status: 500 });
    }

    const { data: rows, error } = await supabase
      .from('attendance_log')
      .select('*')
      .order('id', { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const records = (rows || []).map((r) => ({
      ...r,
      attendance_time: formatTo12Hour(r.attendance_time),
    }));

    return NextResponse.json({
      success: true,
      isConnected: true,
      records,
      newRecordsInserted: 0,
      deviceIp: '192.168.1.63',
      deviceInfo: {
        isConnected: true,
        ip: '192.168.1.63',
        model: 'DS-K1T320EFWX',
        deviceName: 'Access Controller',
        serialNumber: 'DS-K1T320EFWX20240701V030502ENFS1267085',
        macAddress: 'a4:d5:c2:1c:4d:83',
        firmwareVersion: 'V3.5.2',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
