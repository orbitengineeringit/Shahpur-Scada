import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control, pragma, x-cron-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated via JWT (verify_jwt = true in config.toml)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to verify user
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check user has a valid role (admin or operator) — not just any authenticated user
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const allowedRoles = ["admin", "operator"];
    const hasRole = (roles ?? []).some((r: { role: string }) => allowedRoles.includes(r.role));

    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return MQTT credentials from Supabase Secrets (Vault)
    // These are set via: supabase secrets set MQTT_USERNAME=... MQTT_PASSWORD=...
    const mqttUsername = Deno.env.get("MQTT_USERNAME");
    const mqttPassword = Deno.env.get("MQTT_PASSWORD");

    if (!mqttUsername || !mqttPassword) {
      return new Response(
        JSON.stringify({ error: "MQTT credentials not configured in Vault" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const topics = {
      INTAKE: Deno.env.get("MQTT_TOPIC_INTAKE") || "sahpur/intake/plc01/update",
      WTP: Deno.env.get("MQTT_TOPIC_WTP") || "sahpur/wtp/plc01/update",
      OHT1: Deno.env.get("MQTT_TOPIC_OHT1") || "sahpur/oht1/plc01/update",
      OHT2: Deno.env.get("MQTT_TOPIC_OHT2") || "",
    };

    return new Response(
      JSON.stringify({
        username: mqttUsername,
        password: mqttPassword,
        topics,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
