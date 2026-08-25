import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client not initialized' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const commandId = searchParams.get('id');

    let query = supabase.from('relay_commands').select('*');
    if (commandId) {
      query = query.eq('id', commandId);
    } else {
      // Only fetch active commands created in the last 2 minutes (120s)
      const twoMinsAgo = new Date(Date.now() - 120000).toISOString();
      query = query.gte('created_at', twoMinsAgo).order('id', { ascending: false }).limit(5);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    // 2-Minute Timeout Watchdog Protection
    if (commandId && data && data.length > 0) {
      const latest = data[0];
      const createdTs = new Date(latest.created_at || Date.now()).getTime();
      const nowTs = Date.now();

      // If command is still PENDING/INITIATED and older than 120s (2 minutes), TIMEOUT & AUTO-DELETE!
      if ((latest.status === 'PENDING' || latest.status === 'INITIATED') && nowTs - createdTs > 120000) {
        console.log(`⏰ TIMEOUT: Command ${commandId} reached 2-min limit without Host PC response. Terminating & deleting...`);
        await supabase.from('relay_commands').delete().eq('id', commandId);
        return NextResponse.json({
          success: true,
          commands: [],
          latestCommand: {
            id: commandId,
            command: latest.command,
            status: 'FAILED',
            progress: 'Request Terminated (See Logs)',
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      commands: data || [],
      latestCommand: data && data.length > 0 ? data[0] : null,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client not initialized' }, { status: 500 });
    }

    const body = await request.json();
    const { command, startDate, endDate } = body;

    if (!command) {
      return NextResponse.json({ success: false, error: 'Command type is required' }, { status: 400 });
    }

    const now = new Date();
    const formatHikIso = (d: Date, isEnd = false) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const timePart = isEnd ? '23:59:59' : '00:00:00';
      return `${yyyy}-${mm}-${dd}T${timePart}+05:30`;
    };

    let startHikDate = startDate;
    let endHikDate = endDate || startDate;

    const cmdUpper = String(command).toUpperCase();
    if (cmdUpper === 'SYNC_DAILY') {
      const past2D = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      startHikDate = formatHikIso(past2D, false);
      endHikDate = formatHikIso(now, true);
    } else if (cmdUpper === 'SYNC_WEEKLY') {
      const past7D = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startHikDate = formatHikIso(past7D, false);
      endHikDate = formatHikIso(now, true);
    } else if (cmdUpper === 'SYNC_MONTHLY') {
      const past30D = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startHikDate = formatHikIso(past30D, false);
      endHikDate = formatHikIso(now, true);
    } else if (cmdUpper === 'SYNC_CUSTOM') {
      const parseDateSafely = (dStr?: string) => {
        if (!dStr) return new Date();
        const clean = dStr.trim();
        if (clean.includes('/')) {
          const parts = clean.split('/');
          if (parts.length === 3) {
            let [d, m, y] = parts;
            if (y.length === 2) y = `20${y}`;
            return new Date(Number(y), Number(m) - 1, Number(d));
          }
        }
        if (clean.includes('-')) {
          const parts = clean.split('T')[0].split('-');
          if (parts.length === 3) {
            const [y, m, d] = parts;
            return new Date(Number(y), Number(m) - 1, Number(d));
          }
        }
        return new Date(clean);
      };

      const sDate = parseDateSafely(startDate);
      const eDate = parseDateSafely(endDate || startDate);
      startHikDate = formatHikIso(sDate, false);
      endHikDate = formatHikIso(eDate, true);
    } else {
      if (startDate && !startDate.includes('T')) {
        startHikDate = `${startDate}T00:00:00+05:30`;
      }
      if (endDate && !endDate.includes('T')) {
        endHikDate = `${endDate}T23:59:59+05:30`;
      }
    }

    const newCommand = {
      command: cmdUpper,
      start_date: startHikDate,
      end_date: endHikDate,
      status: 'PENDING',
      progress: 'Request Processing ⚡',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('relay_commands')
      .insert([newCommand])
      .select();

    if (error) {
      console.warn('Notice inserting into relay_commands table:', error.message);
      return NextResponse.json({
        success: false,
        error: error.message,
        hint: 'Please ensure relay_commands table exists in Supabase DB',
      });
    }

    return NextResponse.json({
      success: true,
      command: data && data.length > 0 ? data[0] : newCommand,
      message: `Command [${command}] dispatched to Host PC Relay Agent!`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
