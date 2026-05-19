import { normalize } from '../lib/utils.js';
import { logger } from '../lib/logger.js';
import type {
  DetectedField,
  JobQueueItem,
  UserProfile,
  FieldMapping,
  LLMConfidence,
} from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// Field Mapper — Deterministic + Pattern + LLM Fallback
// PRD Reference: Section 11 (field-mapper.ts)
// ═══════════════════════════════════════════════════════════════

const DETERMINISTIC_MAP: Record<string, string> = {
  'full name': 'personal.full_name',
  'your name': 'personal.full_name',
  'name': 'personal.full_name',
  'first name': 'personal.first_name',
  'given name': 'personal.first_name',
  'last name': 'personal.last_name',
  'surname': 'personal.last_name',
  'family name': 'personal.last_name',
  'email': 'personal.email',
  'email address': 'personal.email',
  'phone': 'personal.phone',
  'mobile': 'personal.phone',
  'contact number': 'personal.phone',
  'linkedin': 'personal.linkedin_url',
  'linkedin profile': 'personal.linkedin_url',
  'portfolio': 'personal.portfolio_url',
  'website': 'personal.portfolio_url',
  'personal url': 'personal.portfolio_url',
  'github': 'personal.github_url',
  'city': 'personal.city',
  'current city': 'personal.city',
  'location': 'personal.city',
  'state': 'personal.state',
  'province': 'personal.state',
  'country': 'personal.country',
  'pin': 'personal.pincode',
  'pincode': 'personal.pincode',
  'zip': 'personal.pincode',
  'postal code': 'personal.pincode',
  'date of birth': 'personal.date_of_birth',
  'dob': 'personal.date_of_birth',
  'gender': 'personal.gender',
  'years of experience': 'total_experience_years',
  'total experience': 'total_experience_years',
  'experience': 'total_experience_years',
  'exp': 'total_experience_years',
  'current salary': 'personal.current_ctc_lpa',
  'current ctc': 'personal.current_ctc_lpa',
  'expected salary': 'personal.expected_ctc_lpa',
  'expected ctc': 'personal.expected_ctc_lpa',
  'notice period': 'personal.notice_period_label',
  'cover letter': 'pregenerated.cover_letter',
  'why should we hire you': 'pregenerated.cover_letter',
};

export const fieldMapper = {
  mapFields(fields: DetectedField[], job: JobQueueItem, profile: UserProfile): FieldMapping[] {
    return fields.map((field) => {
      // Stage 1: Deterministic
      const deterministicValue = this.mapDeterministic(field, profile, job);
      if (deterministicValue != null) {
        return { field, value: deterministicValue, source: 'deterministic' };
      }

      // Stage 2: QA bank pattern match
      const qaValue = this.mapQABank(field, job);
      if (qaValue != null) {
        return { field, value: qaValue, source: 'qa_bank' };
      }

      return { field, value: null, source: 'unmapped' };
    });
  },

  mapDeterministic(field: DetectedField, profile: UserProfile, job: JobQueueItem): string | string[] | boolean | null {
    const label = field.label;

    for (const [pattern, path] of Object.entries(DETERMINISTIC_MAP)) {
      if (label.includes(pattern)) {
        const value = this.resolvePath(profile, path, job);
        if (value != null) return value;
      }
    }

    if (field.type === 'checkbox') {
      if (label.includes('willing to relocate') || label.includes('relocate')) {
        return profile.personal.willing_to_relocate;
      }
      if (label.includes('authorize') || label.includes('authorized') || label.includes('legally')) {
        return profile.work_authorization.authorized_in_india;
      }
      if (
        label.includes('agree') ||
        label.includes('accept') ||
        label.includes('terms') ||
        label.includes('privacy') ||
        label.includes('conditions') ||
        label.includes('consent')
      ) {
        return true;
      }
    }

    if (field.type === 'radio' || field.type === 'select') {
      if (label.includes('willing to relocate') || label.includes('relocate')) {
        return profile.personal.willing_to_relocate ? 'Yes' : 'No';
      }
    }

    if (
      (field.type === 'checkbox' || field.type === 'custom-dropdown' || field.type === 'text') &&
      (label.includes('skill') || label.includes('technology') || label.includes('tech stack'))
    ) {
      return profile.skills;
    }

    return null;
  },

  mapQABank(field: DetectedField, job: JobQueueItem): string | null {
    for (const qa of job.pregenerated.qa_bank) {
      try {
        const regex = new RegExp(qa.question_pattern, 'i');
        if (regex.test(field.label)) {
          return qa.answer;
        }
      } catch {
        // invalid regex — skip
      }
    }
    return null;
  },

  resolvePath(profile: UserProfile, path: string, job: JobQueueItem): string | string[] | boolean | null {
    const parts = path.split('.');
    let current: unknown = profile;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else if (part === 'pregenerated') {
        current = job.pregenerated;
      } else {
        return null;
      }
    }

    if (current == null) return null;
    if (typeof current === 'boolean') return current;
    if (typeof current === 'number') return String(current);
    if (typeof current === 'string') return current;
    if (Array.isArray(current)) return current as string[];
    return null;
  },

  async mapWithLLM(
    field: DetectedField,
    job: JobQueueItem,
    profile: UserProfile
  ): Promise<{ value: string | null; confidence: LLMConfidence }> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'LLM_ASSIST_REQUEST',
          job_id: job.job_id,
          field_label: field.label,
          field_type: field.type,
          options: field.options,
          context: document.title,
          resume_snippet: profile.resume.text_content.slice(0, 500),
        },
        (response) => {
          if (chrome.runtime.lastError || !response) {
            resolve({ value: null, confidence: 'low' });
            return;
          }
          resolve({ value: response.answer, confidence: response.confidence });
        }
      );
    });
  },
};
