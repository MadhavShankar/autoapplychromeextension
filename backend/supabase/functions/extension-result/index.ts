// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: extension-result
// Receives application outcome from extension
// Method: POST /extension/result
// Auth: Bearer <supabase_jwt>
// Body: { record: ApplicationRecord }
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ApplicationRecord {
  job_id: string;
  session_id: string;
  status: string;
  apply_url: string;
  ats_detected: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  fields_total: number;
  fields_filled: number;
  fields_skipped: number;
  fail_reason: string | null;
  fail_detail: string | null;
  confirmation: string | null;
  needs_review_reasons: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { record }: { record: ApplicationRecord } = await req.json();

    if (!record?.job_id || !record?.session_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark job as applied if status is 'applied'
    if (record.status === "applied") {
      await supabase
        .from("job_queue")
        .update({ already_applied: true })
        .eq("user_id", user.id)
        .eq("job_id", record.job_id);
    }

    // Insert application result
    const { error: insertError } = await supabase.from("application_results").insert({
      user_id: user.id,
      job_id: record.job_id,
      session_id: record.session_id,
      status: record.status,
      apply_url: record.apply_url,
      ats_detected: record.ats_detected,
      started_at: record.started_at,
      completed_at: record.completed_at,
      duration_ms: record.duration_ms,
      fields_total: record.fields_total,
      fields_filled: record.fields_filled,
      fields_skipped: record.fields_skipped,
      fail_reason: record.fail_reason,
      fail_detail: record.fail_detail,
      confirmation: record.confirmation,
      needs_review_reasons: record.needs_review_reasons,
    });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
