import { NextResponse } from 'next/server';
import { syncHikvisionAttendance, getSupabaseClient } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    // Attempt direct machine sync & push to Supabase Cloud DB
    const syncResult = await syncHikvisionAttendance(false);
    return NextResponse.json({
      success: syncResult.success,
      isConnected: syncResult.isConnected,
      records: syncResult.records,
      newRecordsInserted: syncResult.newRecordsInserted,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      isConnected: false,
      error: error.message,
    });
  }
}

export async function POST() {
  return GET();
}
