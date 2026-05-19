// ═══════════════════════════════════════════════════════════════
// Supabase Edge Function: extension-llm-assist
// Proxies LLM requests to Claude API (Anthropic)
// Method: POST /extension/llm-assist
// Auth: Bearer <supabase_jwt>
// Body: { job_id, field_label, field_type, options, context, resume_snippet }
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface LLMAssistRequest {
  job_id: string;
  field_label: string;
  field_type: string;
  options: string[];
  context: string;
  resume_snippet: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

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

    const body: LLMAssistRequest = await req.json();
    const { field_label, field_type, options, context, resume_snippet } = body;

    if (!field_label) {
      return new Response(JSON.stringify({ error: "field_label is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build prompt
    const systemPrompt = `You are a helpful assistant that fills job application forms. 
You have access to the user's resume snippet and job context. 
Respond with ONLY a JSON object in this exact format:
{"answer": "your answer here", "confidence": "high|medium|low"}
Rules:
- If the field asks for a number or date, provide it in the expected format.
- If options are provided, pick the best matching option exactly.
- If you cannot answer confidently, return {"answer": "", "confidence": "low"}.
- Never include explanations outside the JSON.`;

    const userPrompt = `Field to fill:
Label: "${field_label}"
Type: ${field_type}
${options.length > 0 ? `Options: ${options.join(", ")}` : ""}

Job Context: ${context}

Resume Snippet: ${resume_snippet}`;

    // Call Anthropic API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ answer: "", confidence: "low" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anthropicData = await anthropicRes.json();
    const content = anthropicData.content?.[0]?.text ?? "";

    // Parse JSON from response
    let answer = "";
    let confidence: "high" | "medium" | "low" = "low";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        answer = String(parsed.answer ?? "").trim();
        confidence = ["high", "medium", "low"].includes(parsed.confidence)
          ? parsed.confidence
          : "low";
      }
    } catch {
      // Fallback: use raw text if it's short
      if (content.length < 200 && !content.includes("{")) {
        answer = content.trim();
        confidence = "medium";
      }
    }

    return new Response(JSON.stringify({ answer, confidence }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ answer: "", confidence: "low" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
