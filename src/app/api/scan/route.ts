import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  return NextResponse.json({
    success: true,
    isConnected: true,
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
}

export async function POST() {
  return GET();
}
