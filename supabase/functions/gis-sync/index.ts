// MPGARUD SCADA-to-GIS Telemetry sync (Version 2.0)
// Pushes only fresh sensor values for Intake + WTP + 4 OHTs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, pragma, x-cron-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function sanitizeRtuValue(val: number | null | undefined): number {
  if (val === null || val === undefined) return 0.0;
  if (!Number.isFinite(val)) return 0.0;
  if (val < 0) return 0.0;
  if (val > 0 && val < 0.0001) return 0.0;
  if (val > 100000000) return 0.0;
  return Number(val.toFixed(2));
}

// MQTT tag-id mapping per request
const TAG = {
  intake: {
    pt1: "INT-PT1", pt2: "INT-PT2", header: "INT-HeaderPT",
    lt: "INT-LT", inFlow: "INT-Flow-IN", outFlow: "INT-Flow-OUT",
  },
  wtp: {
    inFlow: "WTP-Flow-IN", outFlow: "WTP-Flow-OUT",
    rawPh: "WTP-PH-IN", rawTr: "WTP-TA-IN",
    trPh: "WTP-PH", trTr: "WTP-TA", cl: "WTP-CL",
    cwr: "WTP-LT-CW", bw: "WTP-LT-BW", header: "WTP-HeaderPT",
    pt1: "WTP-PT1", pt2: "WTP-PT2",
  },
  oht: (n: number) => ({
    pt1: `OHT${n}-PT1`, pt2: `OHT${n}-PT2`, lt: `OHT${n}-LT`,
    flow: `OHT${n}-Flow`,
  }),
};

const VALID_RANGE: Record<string, { min: number; max: number }> = {
  "INT-PT1": { min: 0, max: 10 }, "INT-PT2": { min: 0, max: 10 },
  "INT-HeaderPT": { min: 0, max: 10 }, "INT-LT": { min: 0, max: 100 },
  "INT-Flow-IN": { min: 0, max: 200 }, "INT-Flow-OUT": { min: 0, max: 200 },
  "WTP-Flow-IN": { min: 0, max: 200 }, "WTP-Flow-OUT": { min: 0, max: 200 },
  "WTP-PH-IN": { min: 0, max: 14 }, "WTP-PH": { min: 0, max: 14 },
  "WTP-TA-IN": { min: 0, max: 100 }, "WTP-TA": { min: 0, max: 100 },
  "WTP-CL": { min: 0, max: 20 }, "WTP-LT-CW": { min: 0, max: 100 },
  "WTP-LT-BW": { min: 0, max: 100 }, "WTP-HeaderPT": { min: 0, max: 10 },
  "WTP-PT1": { min: 0, max: 10 }, "WTP-PT2": { min: 0, max: 10 },
  ...Object.fromEntries([1, 2].flatMap((n) => [
    [`OHT${n}-PT1`, { min: 0, max: 10 }],
    [`OHT${n}-PT2`, { min: 0, max: 10 }],
    [`OHT${n}-LT`, { min: 0, max: 100 }],
    [`OHT${n}-Flow`, { min: 0, max: 50 }],
  ])),
};

const isPercentageLevel = (id: string): boolean =>
  id === "INT-LT" || id === "WTP-LT-CW" || id === "WTP-LT-BW" || /^OHT\d+-LT$/.test(id);

function normalizeReading(id: string, value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const sanitized = sanitizeRtuValue(value);
  const range = VALID_RANGE[id];
  if (!range) return sanitized;
  if (sanitized >= range.min && sanitized <= range.max) return sanitized;
  if (isPercentageLevel(id) && sanitized >= range.min - 2 && sanitized <= range.max + 2) {
    return Math.min(range.max, Math.max(range.min, sanitized));
  }
  return undefined;
}

function toIstString(d: Date | string | number): string {
  const date = new Date(d);
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}.` +
    `${pad(ist.getUTCMilliseconds(), 3)}`;
}

const mld = (m3hr: number | null | undefined): number | undefined =>
  m3hr == null || isNaN(Number(m3hr)) ? undefined : Number((Number(m3hr) * 0.024).toFixed(4));

const num = (v: number | null | undefined): number | undefined =>
  v == null || isNaN(Number(v)) ? undefined : Number(v);

const compact = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));

const configuredFreshnessMinutes = Number(Deno.env.get("GIS_FRESHNESS_MINUTES") || "15");
const freshnessMinutes = Number.isFinite(configuredFreshnessMinutes) && configuredFreshnessMinutes > 0
  ? configuredFreshnessMinutes
  : 15;
const freshnessMs = freshnessMinutes * 60 * 1000;

type GisConfig = {
  api_token: string;
  vendor_key: string;
  base_url: string;
  intake_device_id: string;
  wtp_device_id: string;
  oht1_device_id?: string;
  oht2_device_id?: string;
  oht3_device_id?: string;
  oht4_device_id?: string;
};

// Cache the cron secret across warm invocations to avoid extra vault reads.
let cachedCronSecret: string | null = null;
async function getCronSecret(client: ReturnType<typeof createClient>): Promise<string | null> {
  if (cachedCronSecret) return cachedCronSecret;
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
  cachedCronSecret = data.cron_secret as string;
  return cachedCronSecret;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Service-role client for reading credentials, vault, and writing audit log
  const supabase = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // --- AuthN/AuthZ ---
  // Allow either: (a) signed-in user (browser trigger) OR
  // (b) internal pg_cron call carrying the shared secret in x-cron-key header.
  const cronKey = req.headers.get("x-cron-key");
  const expectedCronKey = await getCronSecret(supabase);
  const isCron = !!cronKey && !!expectedCronKey && cronKey === expectedCronKey;
  console.log("auth-check", {
    hasCronKey: !!cronKey,
    hasExpected: !!expectedCronKey,
    expectedLen: expectedCronKey?.length ?? 0,
    cronKeyLen: cronKey?.length ?? 0,
    isCron,
  });

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  let endpoint = "";
  let requestPayload: Record<string, unknown> | null = null;
  let sanitisedPayload: Record<string, unknown> | null = null;
  let responseStatus: number | null = null;
  let responseBody = "";
  let success = false;
  let errorMessage: string | null = null;
  const includedStations: string[] = [];
  const skippedStations: string[] = [];
  const sourceLatestAt: Record<string, string> = {};
  const invalidReadings = new Map<string, { value: number; timestamp: string }>();

  try {
    // 1) Load GIS config
    const { data: cfgData, error: cfgErr } = await supabase
      .from("gis_config").select("*")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const cfg = cfgData as GisConfig | null;
    if (cfgErr || !cfg) throw new Error(cfgErr?.message || "gis_config row missing");
    endpoint = cfg.base_url;

    // 2) Collect every needed tag id and fetch latest value per tag in one query
    const intakeIds = Object.values(TAG.intake);
    const wtpIds = Object.values(TAG.wtp);
    const ohtIds = [1, 2].flatMap(n => Object.values(TAG.oht(n)));
    const allIds = [...intakeIds, ...wtpIds, ...ohtIds];

    const { data: rows, error: hErr } = await supabase
      .from("telemetry_latest")
      .select("tag_id, value, received_at, quality")
      .in("tag_id", allIds)
      .order("received_at", { ascending: false });
    if (hErr) throw new Error(`telemetry_latest: ${hErr.message}`);

    const latest = new Map<string, { value: number; timestamp: string }>();
    for (const r of rows ?? []) {
      if (!latest.has(r.tag_id)) latest.set(r.tag_id, { value: r.quality === 'good' && r.value !== null ? Number(r.value) : NaN, timestamp: r.received_at });
    }
    const nowMs = Date.now();
    const fresh = (id: string) => {
      const reading = latest.get(id);
      if (!reading) return undefined;
      const timestampMs = Date.parse(reading.timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs < nowMs - freshnessMs || timestampMs > nowMs + 5 * 60 * 1000) {
        return undefined;
      }
      return reading;
    };
    const v = (id: string) => {
      const reading = fresh(id);
      if (!reading) return undefined;
      const normalized = normalizeReading(id, reading.value);
      if (normalized === undefined) {
        invalidReadings.set(id, reading);
        return undefined;
      }
      return normalized;
    };
    const stationTimestamp = (ids: string[]): string | undefined => {
      const timestamps = ids
        .map((id) => fresh(id)?.timestamp)
        .filter((timestamp): timestamp is string => !!timestamp)
        .sort((a, b) => Date.parse(b) - Date.parse(a));
      return timestamps[0];
    };
    const stationLastSeenTimestamp = (ids: string[]): string | undefined => {
      const timestamps = ids
        .map((id) => latest.get(id)?.timestamp)
        .filter((timestamp): timestamp is string => !!timestamp && Number.isFinite(Date.parse(timestamp)))
        .sort((a, b) => Date.parse(b) - Date.parse(a));
      return timestamps[0];
    };
    const hasFreshData = (ids: string[]) => !!stationTimestamp(ids);

    // 3) Build payload
    requestPayload = {
      auth: { token: cfg.api_token, vendorKey: cfg.vendor_key },
    };

    if (hasFreshData(intakeIds)) {
      const sourceAt = stationTimestamp(intakeIds)!;
      sourceLatestAt.intake = sourceAt;
      includedStations.push("intake");
      requestPayload.intake = compact({
        intakWell_Device_id: cfg.intake_device_id,
        intakeWellLevel_mtr: num(v(TAG.intake.lt)),
        outletFlow_mld: mld(v(TAG.intake.outFlow) ?? v(TAG.intake.inFlow)),
        headerDesignPressure: 3.0,
        headerActualPressure: num(v(TAG.intake.header)),
        recordDateTime: toIstString(sourceAt),
      });
      requestPayload.intakePumps = [
        { pumpNumber: 1, ratedPressure: 5.0, actualPressure: num(v(TAG.intake.pt1)) },
        { pumpNumber: 2, ratedPressure: 5.0, actualPressure: num(v(TAG.intake.pt2)) },
      ].map(compact).filter((pump) => pump.actualPressure !== undefined);
    } else {
      skippedStations.push("intake");
      // Garud's contract requires both properties even when the Intake RTU is
      // offline. Send only its identity and honest last-seen timestamp: no
      // stale sensor values, zero substitutes, or fabricated current time.
      const lastSeenAt = stationLastSeenTimestamp(intakeIds) || new Date().toISOString();
      requestPayload.intake = {
        intakWell_Device_id: cfg.intake_device_id,
        recordDateTime: toIstString(lastSeenAt),
      };
      requestPayload.intakePumps = [];
    }

    const wtpIsFresh = hasFreshData(wtpIds);
    const freshOhts: Record<string, unknown>[] = [];
    for (const n of [1, 2]) {
      const tags = TAG.oht(n);
      const ids = Object.values(tags);
      const stationName = `oht${n}`;
      if (!hasFreshData(ids)) {
        skippedStations.push(stationName);
        continue;
      }
      const sourceAt = stationTimestamp(ids)!;
      sourceLatestAt[stationName] = sourceAt;
      includedStations.push(stationName);
      freshOhts.push(compact({
        ohT_Device_id: [cfg.oht1_device_id, cfg.oht2_device_id][n - 1] || `SHA_OHT_00${n}`,
        inletFlow_mld: mld(v(tags.flow)),
        waterLevel_mld: num(v(tags.lt)),
        inletPressure: num(v(tags.pt1) ?? v(tags.pt2)),
        recordDateTime: toIstString(sourceAt),
      }));
    }

    const wtpUnit: Record<string, unknown> = {};
    if (wtpIsFresh) {
      const sourceAt = stationTimestamp(wtpIds)!;
      sourceLatestAt.wtp = sourceAt;
      includedStations.push("wtp");
      wtpUnit.wtp = compact({
        wtP_Device_id: cfg.wtp_device_id,
        inletFlow_mld: mld(v(TAG.wtp.inFlow)),
        outletFlow_mld: mld(v(TAG.wtp.outFlow)),
        backwashLevel: num(v(TAG.wtp.bw)),
        cwrLevel: num(v(TAG.wtp.cwr)),
        rawPh: num(v(TAG.wtp.rawPh)),
        rawTurbidity: num(v(TAG.wtp.rawTr)),
        treatedPh: num(v(TAG.wtp.trPh)),
        chlorine: num(v(TAG.wtp.cl)),
        treatedTurbidity: num(v(TAG.wtp.trTr)),
        headerDesignPressure: 4.0,
        headerActualPressure: num(v(TAG.wtp.header)),
        recordDateTime: toIstString(sourceAt),
      });
      wtpUnit.pumps = [
        { pumpNumber: 1, ratedPressure: 5.0, actualPressure: num(v(TAG.wtp.pt1)) },
        { pumpNumber: 2, ratedPressure: 5.0, actualPressure: num(v(TAG.wtp.pt2)) },
      ].map(compact).filter((pump) => pump.actualPressure !== undefined);
    } else {
      skippedStations.push("wtp");
      // Keep the required WTP envelope without pretending that old telemetry
      // is current. Garud receives no process values and only the honest
      // last-seen timestamp required by its contract.
      const lastSeenAt = stationLastSeenTimestamp(wtpIds) || new Date().toISOString();
      wtpUnit.wtp = {
        wtP_Device_id: cfg.wtp_device_id,
        recordDateTime: toIstString(lastSeenAt),
      };
      wtpUnit.pumps = [];
    }
    // The Garud contract requires the collection even when every OHT is offline.
    // An empty array carries no fabricated OHT reading and lets Garud age the
    // missing devices to OFF based on their last received timestamps.
    wtpUnit.ohts = freshOhts;
    requestPayload.wtpUnits = [wtpUnit];

    // 4) POST to government endpoint (with 15s timeout to prevent cron crash)
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
      signal: AbortSignal.timeout(15_000),
    });
    responseStatus = resp.status;
    responseBody = await resp.text();
    success = resp.ok;
    if (!resp.ok) {
      errorMessage = `HTTP ${resp.status}`;
    } else {
      try {
        const garudResponse = JSON.parse(responseBody) as { statusCode?: number; message?: string };
        if (typeof garudResponse.statusCode === "number" && garudResponse.statusCode >= 400) {
          success = false;
          errorMessage = `Garud statusCode ${garudResponse.statusCode}: ${garudResponse.message || "request rejected"}`;
        }
      } catch { /* non-JSON successful response */ }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    success = false;
  }

  const duration = Date.now() - started;

  // Build a credential-free copy of the payload for the audit log AND the HTTP response.
  if (requestPayload) {
    sanitisedPayload = { ...requestPayload, auth: "[REDACTED]" };
  }

  // 5) Audit log (always)
  try {
    await supabase.from("gis_sync_logs").insert({
      endpoint, request_payload: sanitisedPayload, response_status: responseStatus,
      response_body: responseBody, success, error_message: errorMessage, duration_ms: duration,
    });
  } catch (_) { /* swallow */ }

  return new Response(JSON.stringify({
    success,
    proof: {
      endpoint, status: responseStatus, response: responseBody, duration_ms: duration,
      freshness_minutes: freshnessMinutes,
      included_stations: includedStations,
      skipped_stations: skippedStations,
      source_latest_at: sourceLatestAt,
      invalid_readings: Object.fromEntries(invalidReadings),
    },
    request_payload: sanitisedPayload, error: errorMessage,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
