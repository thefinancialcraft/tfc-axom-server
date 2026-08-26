import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/hikvision';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client not initialized' }, { status: 500 });
    }

    // Query Host PC Master Node heartbeat from Supabase
    const { data, error } = await supabase
      .from('relay_status')
      .select('*')
      .eq('node_id', 'HOST_PC_MASTER')
      .limit(1);

    if (error) {
      return NextResponse.json({
        success: false,
        hostPcOnline: false,
        error: error.message,
        hint: 'Please ensure relay_status table exists in Supabase DB',
      });
    }

    const hostNode = data && data.length > 0 ? data[0] : null;
    let isOnline = false;

    if (hostNode && hostNode.last_heartbeat) {
      const lastHb = new Date(hostNode.last_heartbeat).getTime();
      const now = Date.now();
      // If heartbeat was updated within last 90 seconds, Host PC is ONLINE!
      if (now - lastHb < 90000) {
        isOnline = true;
      }
    }

    return NextResponse.json({
      success: true,
      hostPcOnline: isOnline,
      machineConnected: isOnline && !!hostNode?.machine_connected,
      hostNode: hostNode || {
        node_id: 'HOST_PC_MASTER',
        status: 'OFFLINE',
        last_heartbeat: null,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, hostPcOnline: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Supabase client not initialized' }, { status: 500 });
    }

    const body = await request.json();
    const heartbeatObj = {
      node_id: 'HOST_PC_MASTER',
      status: body.status || 'ONLINE',
      machine_ip: body.machineIp || '192.168.1.63',
      machine_connected: body.machineConnected !== undefined ? body.machineConnected : true,
      auth_token: 'TFC-MASTER-RELAY-V2',
      processed_count: body.processedCount || 0,
      last_heartbeat: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('relay_status')
      .upsert([heartbeatObj], { onConflict: 'node_id' })
      .select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({
      success: true,
      hostNode: data && data.length > 0 ? data[0] : heartbeatObj,
      message: 'Host PC Heartbeat updated in Supabase DB!',
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
