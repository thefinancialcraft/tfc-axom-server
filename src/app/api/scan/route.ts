import { NextResponse } from 'next/server';
import { getHikvisionDeviceInfo } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const info = await getHikvisionDeviceInfo();
  return NextResponse.json({
    success: info.isConnected,
    isConnected: info.isConnected,
    deviceIp: info.ip,
    deviceInfo: info,
  });
}

export async function POST() {
  return GET();
}
