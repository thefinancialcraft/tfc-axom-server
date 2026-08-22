import { NextResponse } from 'next/server';
import { syncHikvisionAttendance } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep') === 'true';
  const result = await syncHikvisionAttendance(deep);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep') === 'true';
  const result = await syncHikvisionAttendance(deep);
  return NextResponse.json(result);
}
