import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client unavailable' }, { status: 500 });
    }

    // 1. Fetch employees from public.employees
    const { data: empData, error: empErr } = await supabase
      .from('employees')
      .select('employeeId, employeeName, employeeType, is_active')
      .order('employeeName', { ascending: true });

    if (empErr) {
      console.error('Error fetching employees from Supabase:', empErr);
      return NextResponse.json({ success: false, error: empErr.message }, { status: 500 });
    }

    // 2. Fetch distinct employee IDs from attendance_log to catch any missing ones
    const { data: attData } = await supabase
      .from('attendance_log')
      .select('employee_id, user_name');

    const empMap = new Map<string, { employeeId: string; employeeName: string; is_active: boolean }>();

    (empData || []).forEach((e: any) => {
      if (e.employeeId) {
        empMap.set(e.employeeId, {
          employeeId: e.employeeId,
          employeeName: e.employeeName || e.employeeId,
          is_active: e.is_active !== false, // default true
        });
      }
    });

    // Merge any unique employees from attendance_log not yet in employees table
    (attData || []).forEach((a: any) => {
      if (a.employee_id && !empMap.has(a.employee_id)) {
        empMap.set(a.employee_id, {
          employeeId: a.employee_id,
          employeeName: a.user_name || a.employee_id,
          is_active: true,
        });
      }
    });

    const employees = Array.from(empMap.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName)
    );

    return NextResponse.json({ success: true, employees });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client unavailable' }, { status: 500 });
    }

    const body = await req.json();
    const { employeeId, employeeName, is_active } = body;

    if (!employeeId) {
      return NextResponse.json({ success: false, error: 'employeeId is required' }, { status: 400 });
    }

    const activeState = is_active !== false;

    // Upsert into public.employees table with employeeType specified
    const { data, error } = await supabase
      .from('employees')
      .upsert(
        {
          employeeId,
          employeeName: employeeName || employeeId,
          employeeType: 'BIOMETRIC',
          is_active: activeState,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'employeeId' }
      )
      .select();

    if (error) {
      console.error('Error updating employee status in Supabase:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, employee: data ? data[0] : null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
