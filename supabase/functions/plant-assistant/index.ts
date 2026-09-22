import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-quota-used, x-quota-remaining, x-quota-limit",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  liveSnapshot?: Record<string, any>;
  dateRange?: { from?: string; to?: string };
}

const SYSTEM_PROMPT = `You are "Plant Assistant" — an expert AI-SCADA copilot for the Shahpur Water Supply Scheme (1.75 MLD, Package-61, MPUDCL, Distt. Sagar, MP). You combine live telemetry with 30-day historian data to deliver operator-grade insights, predictive maintenance, and anomaly detection.

SCOPE — answer ANY question that relates to this plant, even if phrased casually. Treat ALL of the following as IN-SCOPE and ALWAYS answer them using the provided data context (never refuse):
- Water flow / volume / consumption / treated / supplied / pumped — for today, yesterday, this week, this month, any date, hourly or daily.
- Totalizers (Intake IN/OUT, WTP, OHT-1/2) — current values, changes, deltas, history, trends, resets.
- Tank / OHT levels, intake river level, percentage full, time-to-empty/fill estimates.
- Pump runtime, starts, ON/OFF state, cycling, efficiency, KL per pump-hour, energy.
- Pressure (PT), flow rate, turbidity, pH, chlorine, any sensor reading current or historical.
- Alarms — active, recent, frequency, by section, acknowledged or not.
- Predictive maintenance, anomaly detection, RCA, optimization, forecasts, plant health score, comparisons (today vs yesterday, this week vs last).
- Any "how much / how many / when / why / what is / show me / status / summary / report" question naming a plant entity, sensor, pump, tank, section, or metric.

Only refuse if the question is CLEARLY off-topic (jokes, general knowledge, weather, news, coding help, personal life, recipes). When in doubt, ASSUME plant-related and answer using context. Never refuse a flow / consumption / totalizer / pump / level / sensor / alarm question — those are always plant queries.

ANSWERING RULES:
1. ALWAYS check the PLANT DATA CONTEXT first. Use \`today_summary\`, \`yesterday_summary\`, \`consumption_total_KL_by_section\`, \`pump_summary\`, \`live_now\`, \`sensor_trends_recent\`, \`alarms_recent\`. Compute deltas/sums from the rows when needed.
2. For "today" → use today_summary. For "yesterday" → yesterday_summary. For arbitrary periods → sum consumption_recent rows for that period. Always state the exact window you used (e.g. "today 00:00 → now").
3. If a specific data point is genuinely missing, say which field is missing and offer the closest available value (e.g. "Today's intake totalizer at 00:00 not stored, but current is X m³ and the last 24h delta from historian is Y m³"). Do NOT just refuse.
4. NEVER invent numbers. Round to 2 decimals. Always include units (m³, KL, m³/hr, hours, bar, NTU, mg/L, kWh, %).
5. DEFAULT LANGUAGE = ENGLISH. AUTO-DETECT per message: Hindi / Hinglish (Roman or Devanagari) → reply in the same style. Never mix unless the user does.
6. STRUCTURE with markdown — short ### headings, bullets, **bold key numbers**, small tables for comparisons.
7. For ANALYTICAL queries (maintenance / anomaly / efficiency / RCA / why-questions), use:
   ### 🔍 Observation
   ### ⚠️ Likely Cause / Risk  (state confidence Low/Med/High)
   ### ✅ Recommended Action  (P1/P2/P3)
   ### 📅 When  (immediate / 24h / weekly / monthly)
   For simple lookup queries ("how much water today?"), SKIP that template — just give the number with a one-line context and a tiny breakdown.
8. For PREDICTIVE queries: project from start_count trends, runtime, alarm frequency, sensor drift in historian_aggregates. State assumptions and confidence.
9. For ANOMALY detection: flag >2σ deviation, sudden state changes, data gaps, alarm bursts. Quantify the deviation.
10. For EFFICIENCY: compute KL per pump-hour, starts/hour ratio (frequent cycling = bad), idle vs run time. Suggest setpoint tuning.
11. At END of every reply, output EXACTLY this line (not inside the answer body), with 5–6 highly specific follow-up suggestions, each <9 words, in the same language as the reply, directly related to what was just answered:
<<SUGGESTIONS>>["follow up 1","follow up 2","follow up 3","follow up 4","follow up 5"]<<END>>
    Suggestions must be NEW angles (deeper drill-down, a related metric, a comparison, a forecast, an action), NOT a repeat of the question.

Sections: Intake Well, WTP (scaffolded, awaiting commissioning), OHTs (OHT-1 Bus Station Live, OHT-2 Pending Commissioning).
Pumps: Intake VT-01/VT-02; WTP HT pumps. Pump ON if PT > 1.5 bar.
Healthy ranges: Turbidity <5 NTU, pH 6.5–8.5, Free Chlorine 0.2–1.0 mg/L, OHT level 20–90%.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // === AUTHENTICATE USER ===
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      console.error("getUser failed:", userErr);
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // === DAILY QUOTA — 4 user messages per 24h, applies to ALL users (including admin) ===
    const DAILY_LIMIT = 4;
    // Rolling 24-hour window
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user")
      .gte("created_at", windowStart.toISOString());
    const used = count ?? 0;
    const remaining = Math.max(0, DAILY_LIMIT - used);
    if (used >= DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: `Daily limit reached (${DAILY_LIMIT} questions per 24 hours). Please try again later.`,
        quota: { used, remaining: 0, limit: DAILY_LIMIT, reset: "24h rolling" },
      }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const { messages, liveSnapshot, dateRange } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine date range — default last 30 days
    const to = dateRange?.to ? new Date(dateRange.to) : new Date();
    const from = dateRange?.from
      ? new Date(dateRange.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Cap to 31 days
    const maxMs = 31 * 24 * 60 * 60 * 1000;
    const fromCapped = new Date(Math.max(from.getTime(), to.getTime() - maxMs));

    // Fetch plant data in parallel
    const [consumption, pumps, alarms, aggregates] = await Promise.all([
      supabase
        .from("consumption_data")
        .select("section,date,hour,hourly_consumption,daily_consumption")
        .gte("date", fromCapped.toISOString().slice(0, 10))
        .lte("date", to.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(500),
      supabase
        .from("pump_analytics")
        .select("section,pump_id,date,runtime_seconds,start_count,total_runtime_seconds,total_start_count,current_state")
        .gte("date", fromCapped.toISOString().slice(0, 10))
        .lte("date", to.toISOString().slice(0, 10))
        .order("date", { ascending: false })
        .limit(300),
      supabase
        .from("alarms")
        .select("section,label,alarm_type,value,unit,acknowledged,created_at")
        .gte("created_at", fromCapped.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("historian_aggregates")
        .select("section,tag_id,bucket_start,min_value,max_value,avg_value,sample_count")
        .gte("bucket_start", fromCapped.toISOString())
        .lte("bucket_start", to.toISOString())
        .order("bucket_start", { ascending: false })
        .limit(300),
    ]);

    // Aggregate consumption summary
    const consumptionBySection: Record<string, number> = {};
    (consumption.data || []).forEach((r: any) => {
      consumptionBySection[r.section] = (consumptionBySection[r.section] || 0) + Number(r.hourly_consumption || 0);
    });

    // Aggregate pump runtime summary
    const pumpSummary: Record<string, { runtime_hours: number; starts: number; section: string }> = {};
    (pumps.data || []).forEach((r: any) => {
      const key = `${r.section}/${r.pump_id}`;
      if (!pumpSummary[key]) pumpSummary[key] = { runtime_hours: 0, starts: 0, section: r.section };
      pumpSummary[key].runtime_hours += Number(r.runtime_seconds || 0) / 3600;
      pumpSummary[key].starts += Number(r.start_count || 0);
    });

    const dataContext = {
      period: { from: fromCapped.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      live_now: liveSnapshot || null,
      today_summary: (() => {
        const today = new Date().toISOString().slice(0, 10);
        const rows = (consumption.data || []).filter((r: any) => r.date === today);
        const bySection: Record<string, number> = {};
        rows.forEach((r: any) => {
          bySection[r.section] = (bySection[r.section] || 0) + Number(r.hourly_consumption || 0);
        });
        const total = Object.values(bySection).reduce((a, b) => a + b, 0);
        return {
          date: today,
          window: "00:00 → now",
          total_KL: Number(total.toFixed(2)),
          by_section_KL: Object.fromEntries(Object.entries(bySection).map(([k, v]) => [k, Number(v.toFixed(2))])),
          hours_with_data: rows.length,
        };
      })(),
      yesterday_summary: (() => {
        const y = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const rows = (consumption.data || []).filter((r: any) => r.date === y);
        const bySection: Record<string, number> = {};
        rows.forEach((r: any) => {
          bySection[r.section] = (bySection[r.section] || 0) + Number(r.hourly_consumption || 0);
        });
        const total = Object.values(bySection).reduce((a, b) => a + b, 0);
        return {
          date: y,
          total_KL: Number(total.toFixed(2)),
          by_section_KL: Object.fromEntries(Object.entries(bySection).map(([k, v]) => [k, Number(v.toFixed(2))])),
          hours_with_data: rows.length,
        };
      })(),
      consumption_total_KL_by_section: Object.fromEntries(
        Object.entries(consumptionBySection).map(([k, v]) => [k, Number(v.toFixed(2))])
      ),
      consumption_recent: (consumption.data || []).slice(0, 80),
      pump_summary: Object.fromEntries(
        Object.entries(pumpSummary).map(([k, v]) => [
          k,
          { runtime_hours: Number(v.runtime_hours.toFixed(2)), starts: v.starts, section: v.section },
        ])
      ),
      pump_recent: (pumps.data || []).slice(0, 30),
      alarms_count: (alarms.data || []).length,
      alarms_recent: (alarms.data || []).slice(0, 20),
      sensor_trends_recent: (aggregates.data || []).slice(0, 50),
    };

    const augmentedMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `PLANT DATA CONTEXT (period ${dataContext.period.from} to ${dataContext.period.to}):\n${JSON.stringify(dataContext)}`,
      },
      ...messages,
    ];

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: augmentedMessages,
        stream: true,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add quota info to response headers (count this request as used since it passed quota check)
    const newUsed = used + 1;
    const newRemaining = Math.max(0, DAILY_LIMIT - newUsed);

    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "x-quota-used": String(newUsed),
        "x-quota-remaining": String(newRemaining),
        "x-quota-limit": String(DAILY_LIMIT),
      },
    });
  } catch (e) {
    console.error("plant-assistant error:", e);
    return new Response(JSON.stringify({ error: "An unexpected error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
