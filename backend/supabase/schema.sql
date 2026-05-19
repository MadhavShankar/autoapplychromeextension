-- ═══════════════════════════════════════════════════════════════
-- WisOwl Auto-Apply · Supabase Backend Schema
-- Stack: Supabase (Postgres + Auth + Storage + Edge Functions)
-- PRD Reference: Section 06 — Internal Data Models
-- ═══════════════════════════════════════════════════════════════

-- ── Enable required extensions ──
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ── Profiles (extends Supabase Auth users) ──
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone text,
  phone_without_code text,
  linkedin_url text,
  portfolio_url text,
  github_url text,
  city text,
  state text,
  country text default 'India',
  country_code text default 'IN',
  pincode text,
  current_ctc numeric(12,2),
  expected_ctc numeric(12,2),
  current_ctc_lpa text,
  expected_ctc_lpa text,
  notice_period_days integer default 30,
  notice_period_label text default '30 days',
  willing_to_relocate boolean default false,
  gender text,
  date_of_birth date,
  resume_filename text,
  resume_storage_path text,
  resume_size_bytes integer,
  resume_text_content text,
  total_experience_years numeric(4,1) default 0,
  total_experience_months integer default 0,
  authorized_in_india boolean default true,
  requires_visa boolean default false,
  daily_cap integer default 25,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.profiles is 'Core user profile synced from extension';

-- ── Work Experience ──
create table if not exists public.experiences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company text not null,
  title text not null,
  start_date text not null, -- YYYY-MM
  end_date text, -- YYYY-MM | null = current
  is_current boolean default false,
  description text,
  created_at timestamptz default now()
);

create index idx_experiences_user_id on public.experiences(user_id);

-- ── Education ──
create table if not exists public.education (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  institution text not null,
  degree text not null,
  degree_type text not null,
  graduation_year integer not null,
  percentage_gpa text,
  created_at timestamptz default now()
);

create index idx_education_user_id on public.education(user_id);

-- ── Skills ──
create table if not exists public.skills (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill text not null,
  proficiency text default 'intermediate', -- beginner | intermediate | expert
  created_at timestamptz default now(),
  unique(user_id, skill)
);

create index idx_skills_user_id on public.skills(user_id);

-- ── Job Queue (daily matched jobs) ──
create table if not exists public.job_queue (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null,
  match_score text not null check (match_score in ('high', 'medium')),
  title text not null,
  company text not null,
  apply_url text not null,
  job_description text,
  ats_hint text,
  already_applied boolean default false,
  -- Pre-generated content (JSONB for flexibility)
  pregenerated jsonb default '{}',
  -- Example pregenerated shape:
  -- {
  --   "cover_letter": "...",
  --   "qa_bank": [
  --     {"question_pattern": "salary.*expectation", "answer": "15 LPA"},
  --     ...
  --   ]
  -- }
  pregenerated_at timestamptz,
  generated_at timestamptz default now(),
  valid_until timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now(),
  unique(user_id, job_id)
);

create index idx_job_queue_user_id on public.job_queue(user_id);
create index idx_job_queue_user_applied on public.job_queue(user_id, already_applied);
create index idx_job_queue_match on public.job_queue(user_id, match_score);

-- ── Application Results (outcomes logged by extension) ──
create table if not exists public.application_results (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id text not null,
  session_id text not null,
  status text not null check (status in ('pending', 'running', 'applied', 'failed', 'needs_review', 'skipped')),
  apply_url text not null,
  ats_detected text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  fields_total integer default 0,
  fields_filled integer default 0,
  fields_skipped integer default 0,
  fail_reason text,
  fail_detail text,
  confirmation text,
  needs_review_reasons text[] default '{}',
  created_at timestamptz default now()
);

create index idx_application_results_user_id on public.application_results(user_id);
create index idx_application_results_session on public.application_results(session_id);
create index idx_application_results_status on public.application_results(user_id, status);

-- ── Daily Application Stats (materialized view helper) ──
create table if not exists public.daily_stats (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null default current_date,
  attempted integer default 0,
  applied integer default 0,
  failed integer default 0,
  skipped integer default 0,
  needs_review integer default 0,
  unique(user_id, date)
);

create index idx_daily_stats_user_date on public.daily_stats(user_id, date);

-- ── ATS Mappings (reference table for field labels per ATS) ──
create table if not exists public.ats_mappings (
  id uuid primary key default uuid_generate_v4(),
  ats_key text not null,
  field_pattern text not null, -- regex pattern
  field_type text not null,
  deterministic_value text, -- static value if any
  requires_llm boolean default false,
  created_at timestamptz default now()
);

-- Seed basic ATS mappings
insert into public.ats_mappings (ats_key, field_pattern, field_type, deterministic_value, requires_llm)
values
  ('greenhouse', '.*full.?name.*', 'text', null, false),
  ('greenhouse', '.*email.*', 'email', null, false),
  ('greenhouse', '.*phone.*', 'tel', null, false),
  ('greenhouse', '.*linkedin.*', 'text', null, false),
  ('greenhouse', '.*website.*|.*portfolio.*', 'text', null, false),
  ('lever', '.*name.*', 'text', null, false),
  ('lever', '.*email.*', 'email', null, false),
  ('lever', '.*phone.*', 'tel', null, false),
  ('workday', '.*name.*', 'text', null, false),
  ('workday', '.*email.*', 'email', null, false),
  ('workday', '.*phone.*', 'tel', null, false),
  ('zoho', '.*name.*', 'text', null, false),
  ('zoho', '.*email.*', 'email', null, false),
  ('darwinbox', '.*name.*', 'text', null, false),
  ('darwinbox', '.*email.*', 'email', null, false),
  ('taleo', '.*name.*', 'text', null, false),
  ('taleo', '.*email.*', 'email', null, false),
  ('keka', '.*name.*', 'text', null, false),
  ('keka', '.*email.*', 'email', null, false),
  ('freshteam', '.*name.*', 'text', null, false),
  ('freshteam', '.*email.*', 'email', null, false),
  ('successfactors', '.*name.*', 'text', null, false),
  ('successfactors', '.*email.*', 'email', null, false),
  ('linkedin', '.*name.*', 'text', null, false),
  ('linkedin', '.*email.*', 'email', null, false),
  ('naukri_indeed', '.*name.*', 'text', null, false),
  ('naukri_indeed', '.*email.*', 'email', null, false)
on conflict do nothing;

-- ── Row Level Security (RLS) ──

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.experiences enable row level security;
alter table public.education enable row level security;
alter table public.skills enable row level security;
alter table public.job_queue enable row level security;
alter table public.application_results enable row level security;
alter table public.daily_stats enable row level security;

-- Policies: users can only access their own data

-- Profiles
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Experiences
create policy "Users can CRUD own experiences"
  on public.experiences for all using (auth.uid() = user_id);

-- Education
create policy "Users can CRUD own education"
  on public.education for all using (auth.uid() = user_id);

-- Skills
create policy "Users can CRUD own skills"
  on public.skills for all using (auth.uid() = user_id);

-- Job Queue
create policy "Users can view own job queue"
  on public.job_queue for select using (auth.uid() = user_id);

create policy "Service role can manage job queue"
  on public.job_queue for all using (true)
  with check (true);

-- Application Results
create policy "Users can view own application results"
  on public.application_results for select using (auth.uid() = user_id);

create policy "Service role can insert application results"
  on public.application_results for insert with check (true);

create policy "Service role can update application results"
  on public.application_results for update using (true);

-- Daily Stats
create policy "Users can view own daily stats"
  on public.daily_stats for select using (auth.uid() = user_id);

-- ── Functions ──

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Get user profile as JSON for extension
CREATE OR REPLACE FUNCTION public.get_user_profile_json(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'personal', jsonb_build_object(
      'full_name', p.full_name,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'email', p.email,
      'phone', p.phone,
      'phone_without_code', p.phone_without_code,
      'linkedin_url', p.linkedin_url,
      'portfolio_url', p.portfolio_url,
      'github_url', p.github_url,
      'city', p.city,
      'state', p.state,
      'country', p.country,
      'country_code', p.country_code,
      'pincode', p.pincode,
      'current_ctc', p.current_ctc,
      'expected_ctc', p.expected_ctc,
      'current_ctc_lpa', p.current_ctc_lpa,
      'expected_ctc_lpa', p.expected_ctc_lpa,
      'notice_period_days', p.notice_period_days,
      'notice_period_label', p.notice_period_label,
      'willing_to_relocate', p.willing_to_relocate,
      'gender', p.gender,
      'date_of_birth', p.date_of_birth
    ),
    'resume', jsonb_build_object(
      'signed_url', '', -- populated by edge function
      'filename', p.resume_filename,
      'size_bytes', p.resume_size_bytes,
      'text_content', p.resume_text_content
    ),
    'experience', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'company', e.company,
          'title', e.title,
          'start_date', e.start_date,
          'end_date', e.end_date,
          'is_current', e.is_current,
          'description', e.description
        ) order by e.start_date desc
      ) from public.experiences e where e.user_id = p.id),
      '[]'::jsonb
    ),
    'education', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'institution', ed.institution,
          'degree', ed.degree,
          'degree_type', ed.degree_type,
          'graduation_year', ed.graduation_year,
          'percentage_gpa', ed.percentage_gpa
        ) order by ed.graduation_year desc
      ) from public.education ed where ed.user_id = p.id),
      '[]'::jsonb
    ),
    'skills', coalesce(
      (select jsonb_agg(s.skill) from public.skills s where s.user_id = p.id),
      '[]'::jsonb
    ),
    'total_experience_years', p.total_experience_years,
    'total_experience_months', p.total_experience_months,
    'work_authorization', jsonb_build_object(
      'authorized_in_india', p.authorized_in_india,
      'requires_visa', p.requires_visa
    )
  ) into result
  from public.profiles p
  where p.id = p_user_id;

  return result;
end;
$$;

-- Get job queue for extension
CREATE OR REPLACE FUNCTION public.get_job_queue_json(p_user_id uuid, p_date date DEFAULT current_date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
declare
  result jsonb;
  v_daily_cap integer;
begin
  select daily_cap into v_daily_cap from public.profiles where id = p_user_id;
  
  select jsonb_build_object(
    'user_id', p_user_id::text,
    'generated_at', now(),
    'daily_cap', coalesce(v_daily_cap, 25),
    'jobs', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'job_id', jq.job_id,
          'match_score', jq.match_score,
          'title', jq.title,
          'company', jq.company,
          'apply_url', jq.apply_url,
          'job_description', jq.job_description,
          'ats_hint', jq.ats_hint,
          'already_applied', jq.already_applied,
          'pregenerated', coalesce(jq.pregenerated, '{}'::jsonb)
        ) order by jq.match_score, jq.created_at
      )
      from public.job_queue jq
      where jq.user_id = p_user_id
        and jq.already_applied = false
        and jq.valid_until >= p_date
      ),
      '[]'::jsonb
    )
  ) into result;

  return result;
end;
$$;

-- Upsert daily stats on result insert
CREATE OR REPLACE FUNCTION public.upsert_daily_stats()
RETURNS TRIGGER AS $$
BEGIN
  insert into public.daily_stats (user_id, date, attempted, applied, failed, skipped, needs_review)
  values (
    NEW.user_id,
    current_date,
    case when NEW.status != 'pending' then 1 else 0 end,
    case when NEW.status = 'applied' then 1 else 0 end,
    case when NEW.status = 'failed' then 1 else 0 end,
    case when NEW.status = 'skipped' then 1 else 0 end,
    case when NEW.status = 'needs_review' then 1 else 0 end
  )
  on conflict (user_id, date)
  do update set
    attempted = daily_stats.attempted + excluded.attempted,
    applied = daily_stats.applied + excluded.applied,
    failed = daily_stats.failed + excluded.failed,
    skipped = daily_stats.skipped + excluded.skipped,
    needs_review = daily_stats.needs_review + excluded.needs_review;

  return NEW;
END;
$$ language 'plpgsql';

create trigger application_result_stats
  after insert on public.application_results
  for each row execute function public.upsert_daily_stats();

-- ── Storage Bucket for Resumes ──
-- Run via Supabase Dashboard or Storage API:
-- create bucket 'resumes' with public = false;
-- Add policy: users can only access their own resume files
