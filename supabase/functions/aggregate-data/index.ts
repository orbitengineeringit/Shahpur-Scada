import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Service-role client for all DB operations
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ----------------------------------------------------------------
    // Auth path 1: x-cron-key (for pg_cron scheduled calls)
    // ----------------------------------------------------------------
    const cronKey = req.headers.get('x-cron-key');
    let calledByCron = false;
    if (cronKey) {
      const { data: cfgRow } = await supabase
        .from('gis_config')
        .select('cron_secret')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cronKey !== cfgRow?.cron_secret) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      calledByCron = true;
    } else {
      // ----------------------------------------------------------------
      // Auth path 2: Bearer JWT (for manual admin UI calls)
      // ----------------------------------------------------------------
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Admin role check
      const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ----------------------------------------------------------------
    // Determine the bucket to aggregate
    // ----------------------------------------------------------------
    const now = new Date();
    const bucketStart = new Date(now);

    if (calledByCron) {
      // When called by pg_cron (at HH:02), aggregate the PREVIOUS complete hour.
      // e.g., at 14:02 → aggregate bucket 13:00–14:00 (full, closed bucket).
      bucketStart.setHours(now.getHours() - 1, 0, 0, 0);
    } else {
      // When triggered manually, aggregate the current incomplete hour.
      bucketStart.setMinutes(0, 0, 0);
    }

    const bucketEnd = new Date(bucketStart);
    bucketEnd.setHours(bucketEnd.getHours() + 1);

    console.log(`[aggregate-data] Aggregating bucket: ${bucketStart.toISOString()} → ${bucketEnd.toISOString()} (calledByCron=${calledByCron})`);

    // ----------------------------------------------------------------
    // Fetch active tag configs
    // ----------------------------------------------------------------
    const { data: tagConfigs, error: tcError } = await supabase
      .from('tag_config')
      .select('id, tag_id, section')
      .eq('is_active', true);

    if (tcError) throw tcError;

    let aggregatedCount = 0;

    // ----------------------------------------------------------------
    // Process each tag: compute avg/min/max from historian_logs
    // ----------------------------------------------------------------
    for (const tc of tagConfigs || []) {
      const { data: logs, error: logsError } = await supabase
        .from('historian_logs')
        .select('value')
        .eq('tag_config_id', tc.id)
        .not('value', 'is', null)
        .gte('timestamp', bucketStart.toISOString())
        .lt('timestamp', bucketEnd.toISOString());

      if (logsError || !logs || logs.length === 0) continue;

      const values = logs.map(l => Number(l.value));
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);

      const { error: upsertError } = await supabase
        .from('historian_aggregates')
        .upsert({
          tag_config_id: tc.id,
          tag_id: tc.tag_id,
          section: tc.section,
          bucket_start: bucketStart.toISOString(),
          bucket_size: '1h',
          avg_value: parseFloat(avg.toFixed(4)),
          min_value: parseFloat(min.toFixed(4)),
          max_value: parseFloat(max.toFixed(4)),
          sample_count: values.length,
        }, { onConflict: 'tag_config_id,bucket_start,bucket_size', ignoreDuplicates: false });

      if (!upsertError) aggregatedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        aggregated: aggregatedCount,
        bucket: bucketStart.toISOString(),
        bucket_end: bucketEnd.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[aggregate-data] Internal error:', message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
