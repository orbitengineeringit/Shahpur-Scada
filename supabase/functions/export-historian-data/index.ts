import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-cron-key',
};

const EXPORT_INTERVAL_DAYS = 90;
const RAW_RETENTION_DAYS = 7;
const PAGE_SIZE = 1000;

/**
 * Paginated fetch — reliably pulls ALL rows using Supabase's 1000-row limit.
 * Returns a flat array of all matching rows.
 */
async function fetchAllPaginated(
  supabase: any,
  table: string,
  select: string,
  filters: (q: any) => any,
  orderCol: string
): Promise<any[]> {
  const results: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase.from(table).select(select).order(orderCol, { ascending: true }).range(from, to);
    query = filters(query);
    const { data, error } = await query;

    if (error) throw new Error(`Paginated fetch error on ${table}: ${error.message}`);
    if (data && data.length > 0) {
      results.push(...data);
      page++;
      hasMore = data.length === PAGE_SIZE;
    } else {
      hasMore = false;
    }
  }

  return results;
}

/**
 * Retrieves the shared cron secret for validating internal requests from pg_cron.
 */
async function getCronSecret(client: any): Promise<string | null> {
  const { data, error } = await client
    .from("gis_config")
    .select("cron_secret")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.cron_secret) {
    console.error("getCronSecret failed:", error?.message);
    return null;
  }
  return data.cron_secret as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Authentication & Authorization ---
    // Allow either: (a) signed-in admin user OR (b) internal pg_cron call carrying x-cron-key
    const cronKey = req.headers.get("x-cron-key");
    const expectedCronKey = await getCronSecret(supabase);
    const isCron = !!cronKey && !!expectedCronKey && cronKey === expectedCronKey;

    if (!isCron) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }

      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await userClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
      }

      // Admin role check — destructive operations must be admin-only
      const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch {}
    const action = body.action || 'daily_check';
    const results: any = { action, steps: [] };

    // ===== STEP 1: Cleanup raw historian_logs older than 7 days =====
    if (action === 'daily_check' || action === 'cleanup_raw') {
      const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const { count: rawCount } = await supabase
        .from('historian_logs')
        .select('*', { count: 'exact', head: true })
        .lt('timestamp', cutoff);

      if (rawCount && rawCount > 0) {
        const BATCH = 1000;
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore && totalDeleted < 100000) {
          const { data: toDelete } = await supabase
            .from('historian_logs')
            .select('id')
            .lt('timestamp', cutoff)
            .limit(BATCH);

          if (!toDelete || toDelete.length === 0) { hasMore = false; break; }

          const ids = toDelete.map((r: any) => r.id);
          const { error } = await supabase.from('historian_logs').delete().in('id', ids);

          if (error) { results.steps.push({ step: 'cleanup_raw', error: error.message }); break; }
          totalDeleted += toDelete.length;
          if (toDelete.length < BATCH) hasMore = false;
        }

        results.steps.push({ step: 'cleanup_raw', deleted: totalDeleted, totalEligible: rawCount });
      } else {
        results.steps.push({ step: 'cleanup_raw', message: 'No raw data to clean' });
      }
    }

    // ===== STEP 2: Check if 3-month export is due =====
    if (action === 'daily_check' || action === 'export') {
      const { data: lastExport } = await supabase
        .from('data_exports')
        .select('period_end')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      const now = new Date();
      const lastExportEnd = lastExport ? new Date(lastExport.period_end) : null;
      const shouldExport = !lastExportEnd ||
        (now.getTime() - lastExportEnd.getTime()) >= EXPORT_INTERVAL_DAYS * 24 * 60 * 60 * 1000;

      if (shouldExport || action === 'export') {
        const periodStart = lastExportEnd || new Date('2024-01-01');
        const periodEnd = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        if (periodEnd > periodStart) {
          const pStart = periodStart.toISOString();
          const pEnd = periodEnd.toISOString();

          // 1) Fetch ALL aggregated sensor data (paginated, 1000 per page)
          console.log(`[export] Fetching aggregates from ${pStart} to ${pEnd}`);
          const allAggregates = await fetchAllPaginated(
            supabase,
            'historian_aggregates',
            'tag_id, section, bucket_start, avg_value, min_value, max_value, sample_count',
            (q: any) => q.gte('bucket_start', pStart).lt('bucket_start', pEnd),
            'bucket_start'
          );
          console.log(`[export] Fetched ${allAggregates.length} aggregate rows`);

          // 2) Fetch ALL pump analytics data (daily summaries)
          const allPumpAnalytics = await fetchAllPaginated(
            supabase,
            'pump_analytics',
            'pump_id, section, date, runtime_seconds, start_count, total_runtime_seconds, total_start_count',
            (q: any) => q.gte('date', pStart.split('T')[0]).lt('date', pEnd.split('T')[0]),
            'date'
          );
          console.log(`[export] Fetched ${allPumpAnalytics.length} pump analytics rows`);

          // 3) Fetch ALL consumption data
          const allConsumption = await fetchAllPaginated(
            supabase,
            'consumption_data',
            'section, date, hour, daily_consumption, hourly_consumption, totalizer_start, totalizer_end',
            (q: any) => q.gte('date', pStart.split('T')[0]).lt('date', pEnd.split('T')[0]),
            'date'
          );
          console.log(`[export] Fetched ${allConsumption.length} consumption rows`);

          const totalRecords = allAggregates.length + allPumpAnalytics.length + allConsumption.length;

          if (totalRecords > 0) {
            // Build CSV with all data types
            const csvParts: string[] = [];
            csvParts.push('Type,Timestamp/Date,Section,Tag/Pump ID,Value,Min,Max,Avg,Samples,Runtime(s),Starts,Consumption\n');

            // Aggregates
            for (const row of allAggregates) {
              csvParts.push(`Aggregate,${row.bucket_start},${row.section},${row.tag_id},,${Number(row.min_value).toFixed(4)},${Number(row.max_value).toFixed(4)},${Number(row.avg_value).toFixed(4)},${row.sample_count},,,\n`);
            }

            // Pump analytics (daily summaries)
            for (const row of allPumpAnalytics) {
              csvParts.push(`PumpDaily,${row.date},${row.section},${row.pump_id},,,,,,${row.runtime_seconds},${row.start_count},\n`);
            }

            // Consumption data
            for (const row of allConsumption) {
              const ts = row.hour !== null ? `${row.date} ${String(row.hour).padStart(2, '0')}:00` : row.date;
              csvParts.push(`Consumption,${ts},${row.section},,,,,,,,,${Number(row.hourly_consumption || row.daily_consumption).toFixed(2)}\n`);
            }

            const csv = csvParts.join('');

            const startStr = periodStart.toISOString().split('T')[0];
            const endStr = periodEnd.toISOString().split('T')[0];
            const fileName = `shahpur_scada_export_${startStr}_to_${endStr}.csv`;

            // Ensure storage bucket exists
            const { data: buckets } = await supabase.storage.listBuckets();
            if (!buckets?.find((b: any) => b.id === 'data-exports')) {
              await supabase.storage.createBucket('data-exports', { public: false });
            }

            const { error: uploadError } = await supabase.storage
              .from('data-exports')
              .upload(fileName, new Blob([csv], { type: 'text/csv' }), { contentType: 'text/csv', upsert: true });

            if (uploadError) throw uploadError;

            const { data: signedUrlData } = await supabase.storage
              .from('data-exports')
              .createSignedUrl(fileName, 30 * 24 * 60 * 60);

            const downloadUrl = signedUrlData?.signedUrl || '';

            const { data: exportRecord } = await supabase
              .from('data_exports')
              .insert({
                period_start: periodStart.toISOString(),
                period_end: periodEnd.toISOString(),
                file_path: fileName,
                record_count: totalRecords,
                status: 'exported',
              })
              .select('id')
              .single();

            // Send email notification via Gmail SMTP
            const { data: plantConfig } = await supabase.from('plant_config').select('plant_name').limit(1).maybeSingle();
            const { data: recipientRows } = await supabase
              .from('notification_recipients')
              .select('email')
              .eq('scope', 'export');
            const emails: string[] = (recipientRows || []).map((r: any) => r.email);
            const plantName = (plantConfig as any)?.plant_name || 'Shahpur SCADA';

            const smtpUser = Deno.env.get('SMTP_USER');
            const smtpPass = Deno.env.get('SMTP_PASSWORD');
            let emailSent = false;

            if (smtpUser && smtpPass && emails.length > 0 && downloadUrl) {
              console.log(`[export] Preparing to send SMTP mail to: ${emails.join(', ')}`);
              
              const transporter = nodemailer.createTransport({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                  user: smtpUser,
                  pass: smtpPass,
                },
              });

              const mailOptions = {
                from: `"${plantName}" <${smtpUser}>`,
                to: emails.slice(0, 10).join(', '),
                subject: `📊 ${plantName} - Data Export (${startStr} to ${endStr})`,
                html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
                  <body style="margin:0;padding:0;font-family:'Segoe UI',sans-serif;background:#f3f4f6;">
                    <div style="max-width:600px;margin:0 auto;background:#fff;box-shadow:0 4px 6px rgba(0,0,0,0.1);border-radius:8px;overflow:hidden;margin-top:20px;">
                      <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;padding:35px 25px;text-align:center;">
                        <h1 style="margin:0 0 10px;font-size:24px;font-weight:700;">📊 Data Export Report</h1>
                        <p style="margin:0;font-size:16px;opacity:0.9;">${plantName}</p>
                      </div>
                      <div style="padding:25px;color:#374151;">
                        <h3 style="margin-top:0;color:#1e40af;font-size:18px;">Export Details</h3>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
                          <tr>
                            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;color:#4b5563;">Period</td>
                            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${startStr} to ${endStr}</td>
                          </tr>
                          <tr>
                            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;color:#4b5563;">Total Records</td>
                            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${totalRecords.toLocaleString()}</td>
                          </tr>
                        </table>
                        <ul style="margin:10px 0 25px;padding-left:20px;font-size:14px;color:#6b7280;line-height:1.6;">
                          <li>Sensor Aggregates: ${allAggregates.length.toLocaleString()}</li>
                          <li>Pump Analytics: ${allPumpAnalytics.length.toLocaleString()}</li>
                          <li>Consumption Data: ${allConsumption.length.toLocaleString()}</li>
                        </ul>
                        <div style="margin:30px 0;text-align:center;">
                          <a href="${downloadUrl}" style="display:inline-block;padding:14px 30px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:white;text-decoration:none;border-radius:8px;font-weight:600;box-shadow:0 2px 4px rgba(59,130,246,0.3);">⬇️ Download CSV Report</a>
                        </div>
                        <p style="font-size:12px;color:#9ca3af;text-align:center;">This download link is valid for 30 days.</p>
                      </div>
                      <div style="background:#1f2937;color:#9ca3af;padding:20px 25px;text-align:center;font-size:12px;">
                        <p style="margin:0 0 5px;color:#ffffff;font-weight:600;">${plantName}</p>
                        <p style="margin:0;">Powered by Orbit Engineering Group</p>
                        <p style="margin:10px 0 0;font-size:11px;opacity:0.6;">Automated email. Please do not reply.</p>
                      </div>
                    </div>
                  </body></html>`,
              };

              try {
                const info = await transporter.sendMail(mailOptions);
                console.log('[export] Email sent via SMTP:', info.messageId);
                emailSent = true;
                if (exportRecord?.id) {
                  await supabase.from('data_exports').update({ email_sent: true }).eq('id', exportRecord.id);
                }
              } catch (mailErr) {
                console.error('[export] SMTP send failed:', mailErr);
              }
            } else {
              console.warn('[export] SMTP credentials or recipients missing. SMTP_USER configured:', !!smtpUser);
            }

            results.steps.push({
              step: 'export',
              records: totalRecords,
              aggregates: allAggregates.length,
              pumpAnalytics: allPumpAnalytics.length,
              consumption: allConsumption.length,
              fileName,
              emailSent,
            });
          } else {
            results.steps.push({ step: 'export', message: 'No data to export in this period' });
          }
        } else {
          results.steps.push({ step: 'export', message: 'Period end before start — skipping' });
        }
      } else {
        results.steps.push({ step: 'export', message: 'Not due yet' });
      }
    }

    // ===== STEP 3: Monthly rolling block cleanup (1-year retention) =====
    if (action === 'daily_check' || action === 'cleanup_expired') {
      try {
        // Calculate the cutoff date (start of the current month minus 12 months)
        // Anything before this cutoff will be deleted in monthly blocks.
        const now = new Date();
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const cutoffDate = new Date(startOfCurrentMonth);
        cutoffDate.setMonth(cutoffDate.getMonth() - 12);
        const cutoffStr = cutoffDate.toISOString(); // e.g. "2025-06-01T00:00:00.000Z"
        const cutoffDateOnly = cutoffStr.split('T')[0]; // "2025-06-01"

        console.log(`[cleanup] Running 1-year rolling monthly cleanup. Cutoff: ${cutoffStr}`);

        // 1. Delete aggregates
        const { error: aggErr } = await supabase
          .from('historian_aggregates')
          .delete()
          .lt('bucket_start', cutoffStr);
        if (aggErr) throw aggErr;

        // 2. Delete alarms
        const { error: alarmErr } = await supabase
          .from('alarms')
          .delete()
          .lt('created_at', cutoffStr);
        if (alarmErr) throw alarmErr;

        // 3. Delete pump analytics
        const { error: pumpErr } = await supabase
          .from('pump_analytics')
          .delete()
          .lt('date', cutoffDateOnly);
        if (pumpErr) throw pumpErr;

        // 4. Delete consumption data
        const { error: consErr } = await supabase
          .from('consumption_data')
          .delete()
          .lt('date', cutoffDateOnly);
        if (consErr) throw consErr;

        results.steps.push({
          step: 'cleanup_expired',
          cutoff: cutoffStr,
          status: 'success',
          message: 'Data older than 1 year deleted successfully',
        });
      } catch (err: any) {
        console.error('[cleanup] 1-year rolling cleanup failed:', err.message);
        results.steps.push({
          step: 'cleanup_expired',
          status: 'failed',
          error: err.message,
        });
      }
    }

    // ===== Action: mark_downloaded =====
    if (action === 'mark_downloaded' && body.exportId) {
      const { data: exportRecord } = await supabase
        .from('data_exports')
        .select('id')
        .eq('id', body.exportId)
        .maybeSingle();
      if (!exportRecord) {
        return new Response(JSON.stringify({ error: 'Export not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      await supabase.from('data_exports').update({ downloaded: true }).eq('id', body.exportId);
      results.steps.push({ step: 'mark_downloaded', exportId: body.exportId });
    }

    // ===== Action: get_download_url =====
    if (action === 'get_download_url' && body.filePath) {
      const { data: exportRecord } = await supabase
        .from('data_exports')
        .select('file_path')
        .eq('file_path', body.filePath)
        .maybeSingle();
      if (!exportRecord) {
        return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: signedUrlData } = await supabase.storage.from('data-exports').createSignedUrl(body.filePath, 24 * 60 * 60);
      results.downloadUrl = signedUrlData?.signedUrl || null;
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[export-historian-data] Internal error:', message);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
