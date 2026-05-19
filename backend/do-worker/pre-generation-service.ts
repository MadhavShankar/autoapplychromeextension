// ═══════════════════════════════════════════════════════════════
// Digital Ocean Worker: Pre-Generation Service
// Runs nightly via DO App Platform cron job or scheduled function
// Fetches high/medium matched jobs → calls Claude API → writes
// cover_letter + qa_bank into job_queue.pregenerated JSONB
//
// Environment Variables:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY
//
// Run: node pre-generation-service.js (or ts-node for TS)
// ═══════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ── Configuration ──
const BATCH_SIZE = 10; // jobs per batch to avoid rate limits
const ANTHROPIC_MODEL = "claude-3-sonnet-20240229"; // stronger model for pre-gen
const CLAUDE_MAX_TOKENS = 2048;

interface JobQueueRow {
  id: string;
  user_id: string;
  job_id: string;
  title: string;
  company: string;
  job_description: string;
  apply_url: string;
}

interface UserContext {
  full_name: string;
  skills: string[];
  experience: string;
  resume_text: string;
}

interface PregeneratedContent {
  cover_letter: string;
  qa_bank: Array<{ question_pattern: string; answer: string }>;
}

// ── Supabase Client ──
function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ── Fetch jobs needing pre-generation ──
async function fetchJobsNeedingPregen(supabase: SupabaseClient): Promise<JobQueueRow[]> {
  const { data, error } = await supabase
    .from("job_queue")
    .select("id, user_id, job_id, title, company, job_description, apply_url")
    .eq("already_applied", false)
    .or("pregenerated.eq.{},pregenerated.is.null")
    .order("match_score", { ascending: false })
    .limit(200); // nightly cap

  if (error) {
    console.error("Failed to fetch jobs:", error);
    return [];
  }

  return (data ?? []) as JobQueueRow[];
}

// ── Fetch user context ──
async function fetchUserContext(supabase: SupabaseClient, userId: string): Promise<UserContext | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, resume_text_content")
    .eq("id", userId)
    .single();

  const { data: skills } = await supabase
    .from("skills")
    .select("skill")
    .eq("user_id", userId);

  const { data: experiences } = await supabase
    .from("experiences")
    .select("company, title, description")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(3);

  if (!profile) return null;

  const experienceText = (experiences ?? [])
    .map((e) => `${e.title} at ${e.company}: ${e.description ?? ""}`)
    .join("\n");

  return {
    full_name: profile.full_name ?? "",
    skills: (skills ?? []).map((s) => s.skill),
    experience: experienceText,
    resume_text: profile.resume_text_content ?? "",
  };
}

// ── Call Claude API ──
async function callClaude(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// ── Generate cover letter ──
async function generateCoverLetter(
  job: JobQueueRow,
  user: UserContext
): Promise<string> {
  const systemPrompt = `You are an expert career coach. Write a concise, compelling cover letter 
in professional business English. Use the candidate's background and the job details provided. 
Keep it under 250 words. Return ONLY the cover letter text, no markdown, no explanations.`;

  const userPrompt = `Job: ${job.title} at ${job.company}
Job Description: ${job.job_description ?? "N/A"}

Candidate: ${user.full_name}
Skills: ${user.skills.join(", ")}
Experience:
${user.experience}

Resume Snippet:
${user.resume_text.slice(0, 2000)}`;

  return callClaude(systemPrompt, userPrompt);
}

// ── Generate QA bank ──
async function generateQABank(
  job: JobQueueRow,
  user: UserContext
): Promise<Array<{ question_pattern: string; answer: string }>> {
  const systemPrompt = `You are a helpful assistant that generates likely job application 
screening questions and answers based on a candidate's profile and job description.

Return a JSON array ONLY. Each item must have:
- "question_pattern": a lowercase regex-friendly pattern (e.g., "salary.*expectation")
- "answer": the best answer based on the candidate profile

Generate at most 8 questions. Include common questions like:
- salary expectations
- notice period / availability
- relocation willingness
- years of experience
- visa / work authorization
- highest education
- skill-specific questions based on the job description

Return ONLY valid JSON array. No markdown, no explanations.`;

  const userPrompt = `Job: ${job.title} at ${job.company}
Job Description: ${job.job_description ?? "N/A"}

Candidate: ${user.full_name}
Skills: ${user.skills.join(", ")}
Experience:
${user.experience}

Expected CTC: (from profile)
Notice Period: (from profile)
Willing to Relocate: (from profile)
Education: (from profile)`;

  const raw = await callClaude(systemPrompt, userPrompt);

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item: any) => item.question_pattern && item.answer)
          .slice(0, 8);
      }
    }
  } catch {
    // fallback
  }

  // Fallback deterministic QA bank
  return [
    { question_pattern: "salary.*expectation|expected.*ctc", answer: "" },
    { question_pattern: "notice.*period|available.*join|when.*join", answer: "" },
    { question_pattern: "relocate|relocation|willing.*move", answer: "" },
    { question_pattern: "experience.*years|years.*experience", answer: "" },
    { question_pattern: "visa|work.*authorization|authorized.*work", answer: "" },
    { question_pattern: "highest.*education|degree|qualification", answer: "" },
  ];
}

// ── Save pregenerated content ──
async function savePregenerated(
  supabase: SupabaseClient,
  jobId: string,
  content: PregeneratedContent
): Promise<void> {
  const { error } = await supabase
    .from("job_queue")
    .update({
      pregenerated: content,
      pregenerated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (error) {
    console.error(`Failed to save pregenerated for job ${jobId}:`, error);
  } else {
    console.log(`Saved pregenerated for job ${jobId}`);
  }
}

// ── Main ──
async function main(): Promise<void> {
  console.log("Pre-generation service starting...", new Date().toISOString());

  const supabase = getSupabase();
  const jobs = await fetchJobsNeedingPregen(supabase);

  console.log(`Found ${jobs.length} jobs needing pre-generation`);

  // Group by user to batch context fetches
  const jobsByUser = new Map<string, JobQueueRow[]>();
  for (const job of jobs) {
    const list = jobsByUser.get(job.user_id) ?? [];
    list.push(job);
    jobsByUser.set(job.user_id, list);
  }

  let processed = 0;
  let failed = 0;

  for (const [userId, userJobs] of jobsByUser) {
    const userContext = await fetchUserContext(supabase, userId);
    if (!userContext) {
      console.warn(`No profile found for user ${userId}, skipping ${userJobs.length} jobs`);
      continue;
    }

    for (const job of userJobs) {
      try {
        console.log(`Processing ${job.title} at ${job.company}`);

        const [coverLetter, qaBank] = await Promise.all([
          generateCoverLetter(job, userContext),
          generateQABank(job, userContext),
        ]);

        await savePregenerated(supabase, job.id, {
          cover_letter: coverLetter.trim(),
          qa_bank: qaBank,
        });

        processed++;

        // Rate limiting delay
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error(`Failed to process job ${job.id}:`, err);
        failed++;
      }
    }
  }

  console.log(`Done. Processed: ${processed}, Failed: ${failed}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { main };
