// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: extension-resume-url
// Returns a fresh signed URL for the user's resume
// Method: GET /extension/resume-url
// Auth: Bearer <supabase_jwt>
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

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

    // Get resume path
    const { data: profile } = await supabase
      .from("profiles")
      .select("resume_storage_path, resume_filename")
      .eq("id", user.id)
      .single();

    if (!profile?.resume_storage_path) {
      return new Response(JSON.stringify({ error: "No resume uploaded" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate signed URL (1 hour expiry)
    const { data: urlData, error: urlError } = await supabase.storage
      .from("resumes")
      .createSignedUrl(profile.resume_storage_path, 3600);

    if (urlError || !urlData?.signedUrl) {
      console.error("Storage error:", urlError);
      return new Response(JSON.stringify({ error: "Failed to generate resume URL" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return new Response(
      JSON.stringify({
        signed_url: urlData.signedUrl,
        expires_at: expiresAt,
        filename: profile.resume_filename,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
