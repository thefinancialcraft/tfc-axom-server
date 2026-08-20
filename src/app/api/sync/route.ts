import { NextResponse } from 'next/server';
import { syncHikvisionAttendance } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const result = await syncHikvisionAttendance();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await syncHikvisionAttendance();
  return NextResponse.json(result);
}
