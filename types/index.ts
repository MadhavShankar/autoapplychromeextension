// ═══════════════════════════════════════════════════════════════
// WisOwl Auto-Apply · Shared TypeScript Types
// PRD Reference: Section 06 — Internal Data Models
// ═══════════════════════════════════════════════════════════════

// ── Enums ──

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaiting_user'
  | 'completed'
  | 'error';

export type ApplicationStatus =
  | 'pending'
  | 'running'
  | 'applied'
  | 'failed'
  | 'needs_review'
  | 'skipped';

export type AwaitingReason = 'CAPTCHA' | 'USER_CONFIRM' | null;

export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'number'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file'
  | 'date'
  | 'richtext'
  | 'custom-dropdown'
  | 'unknown';

export type LLMConfidence = 'high' | 'medium' | 'low';

export type MatchScore = 'high' | 'medium';

// ── API Input Models ──

export interface PersonalProfile {
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  phone_without_code: string;
  linkedin_url: string | null;
  portfolio_url: string | null;
  github_url: string | null;
  city: string;
  state: string;
  country: string;
  country_code: string;
  pincode: string | null;
  current_ctc: number;
  expected_ctc: number;
  current_ctc_lpa: string;
  expected_ctc_lpa: string;
  notice_period_days: number;
  notice_period_label: string;
  willing_to_relocate: boolean;
  gender: string | null;
  date_of_birth: string | null; // YYYY-MM-DD
}

export interface ResumeInfo {
  signed_url: string;
  filename: string;
  size_bytes: number;
  text_content: string;
}

export interface ExperienceEntry {
  company: string;
  title: string;
  start_date: string; // YYYY-MM
  end_date: string | null; // YYYY-MM | null = current
  is_current: boolean;
  description: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  degree_type: string;
  graduation_year: number;
  percentage_gpa: string | null;
}

export interface WorkAuthorization {
  authorized_in_india: boolean;
  requires_visa: boolean;
}

export interface UserProfile {
  personal: PersonalProfile;
  resume: ResumeInfo;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  skills: string[];
  total_experience_years: number;
  total_experience_months: number;
  work_authorization: WorkAuthorization;
}

export interface QABankEntry {
  question_pattern: string; // regex string
  answer: string;
}

export interface PregeneratedContent {
  cover_letter: string;
  qa_bank: QABankEntry[];
}

export interface JobQueueItem {
  job_id: string;
  match_score: MatchScore;
  title: string;
  company: string;
  apply_url: string;
  job_description: string;
  ats_hint: string | null;
  already_applied: boolean;
  pregenerated: PregeneratedContent;
}

export interface JobQueue {
  user_id: string;
  generated_at: string; // ISO8601
  daily_cap: number;
  jobs: JobQueueItem[];
}

export interface AuthToken {
  token: string; // JWT
  expires_at: string; // ISO8601
  user_id: string;
  extension_id: string;
}

// ── Internal Storage Models ──

export interface ApplicationRecord {
  job_id: string;
  session_id: string;
  status: ApplicationStatus;
  apply_url: string;
  ats_detected: string | null;
  started_at: string | null; // ISO8601
  completed_at: string | null; // ISO8601
  duration_ms: number;
  fields_total: number;
  fields_filled: number;
  fields_skipped: number;
  fail_reason: string | null;
  fail_detail: string | null;
  confirmation: string | null;
  needs_review_reasons: string[];
}

export interface SessionState {
  session_id: string;
  status: SessionStatus;
  total_jobs: number;
  current_index: number;
  applied_count: number;
  failed_count: number;
  skipped_count: number;
  review_count: number;
  started_at: string | null; // ISO8601
  active_tab_id: number | null;
  awaiting_reason: AwaitingReason;
}

// ── Content Script Models ──

export interface DetectedField {
  selector: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  placeholder: string | null;
  max_length: number;
  accepts: string | null; // e.g. ".pdf,.doc"
}

export interface FieldMapping {
  field: DetectedField;
  value: string | string[] | boolean | null;
  source: 'deterministic' | 'qa_bank' | 'llm' | 'unmapped';
  confidence?: LLMConfidence;
}

export interface FillResult {
  success: boolean;
  field: DetectedField;
  error?: string;
}

// ── Message Payloads ──

export interface StartSessionPayload {
  type: 'START_SESSION';
}

export interface PauseSessionPayload {
  type: 'PAUSE_SESSION';
}

export interface ResumeSessionPayload {
  type: 'RESUME_SESSION';
}

export interface StopSessionPayload {
  type: 'STOP_SESSION';
}

export interface ContinueAwaitingPayload {
  type: 'CONTINUE_AWAITING';
}

export interface SessionUpdatePayload {
  type: 'SESSION_UPDATE';
  state: SessionState;
  records: ApplicationRecord[];
}

export interface InjectJobPayload {
  type: 'INJECT_JOB';
  job: JobQueueItem;
  profile: UserProfile;
}

export interface JobResultPayload {
  type: 'JOB_RESULT';
  record: ApplicationRecord;
}

export interface LLMAssistRequestPayload {
  type: 'LLM_ASSIST_REQUEST';
  job_id: string;
  field_label: string;
  field_type: FieldType;
  options: string[];
  context: string;
  resume_snippet: string;
}

export interface LLMAssistResponsePayload {
  type: 'LLM_ASSIST_RESPONSE';
  answer: string;
  confidence: LLMConfidence;
}

export interface GetResumeFilePayload {
  type: 'GET_RESUME_FILE';
}

export interface GetResumeFileResponse {
  type: 'GET_RESUME_FILE_RESPONSE';
  buffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}

export type WorkerMessage =
  | StartSessionPayload
  | PauseSessionPayload
  | ResumeSessionPayload
  | StopSessionPayload
  | ContinueAwaitingPayload;

export type ContentMessage =
  | InjectJobPayload
  | JobResultPayload
  | LLMAssistRequestPayload
  | GetResumeFilePayload;

export type BackgroundResponseMessage =
  | SessionUpdatePayload
  | LLMAssistResponsePayload
  | GetResumeFileResponse;

// ── API Request/Response Shapes ──

export interface ResumeUrlResponse {
  signed_url: string;
  expires_at: string;
}

export interface LLMAssistRequest {
  job_id: string;
  field_label: string;
  field_type: FieldType;
  options: string[];
  context: string;
  resume_snippet: string;
}

export interface LLMAssistResponse {
  answer: string;
  confidence: LLMConfidence;
}

export interface ResultRequest {
  record: ApplicationRecord;
}

export interface SessionEndRequest {
  session_id: string;
  summary: SessionState;
}

// ── ATS Types ──

export type ATSKey =
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'taleo'
  | 'zoho'
  | 'darwinbox'
  | 'keka'
  | 'freshteam'
  | 'successfactors'
  | 'linkedin'
  | 'naukri_indeed'
  | 'generic';

export interface ATSStrategy {
  key: ATSKey;
  name: string;
  beforeFill?: () => Promise<void> | void;
  detectFields?: (doc: Document) => DetectedField[];
  afterFieldFill?: (field: DetectedField) => Promise<void> | void;
  detectSubmitButton?: (doc: Document) => HTMLElement | null;
  detectConfirmation?: (doc: Document, url: string) => boolean;
  detectNextButton?: (doc: Document) => HTMLElement | null;
}

// ── Storage Keys ──

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'wisowl_auth_token',
  USER_PROFILE: 'wisowl_user_profile',
  JOB_QUEUE: 'wisowl_job_queue',
  SESSION_STATE: 'wisowl_session_state',
  APPLICATION_RECORDS: 'wisowl_application_records',
  RESUME_URL: 'wisowl_resume_url',
  PENDING_RESULTS: 'wisowl_pending_results',
} as const;

// ── Error Codes ──

export type ErrorCode =
  | 'TIMEOUT_PAGE'
  | 'NO_FORM'
  | 'LOGIN_REQUIRED'
  | 'CAPTCHA'
  | 'FIELD_UNMAPPABLE'
  | 'FILE_FETCH_FAIL'
  | 'FILE_TYPE_REJECTED'
  | 'FILE_SIZE_REJECTED'
  | 'FILE_UPLOAD_TIMEOUT'
  | 'FILE_UPLOAD_FAIL'
  | 'NO_SUBMIT_BUTTON'
  | 'VALIDATION_ERROR'
  | 'SUBMIT_UNCONFIRMED'
  | 'TAB_CLOSED'
  | 'WORKER_RESTART'
  | 'AUTH_EXPIRED'
  | 'API_FAIL'
  | 'NETWORK_OFFLINE'
  | 'DYNAMIC_FIELD_OVERFLOW'
  | 'IFRAME_BLOCKED'
  | 'ATS_UNSUPPORTED';
