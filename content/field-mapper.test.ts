import { describe, it, expect } from 'vitest';
import { fieldMapper } from '../content/field-mapper.js';
import type { DetectedField, JobQueueItem, UserProfile } from '../types/index.js';

function makeField(label: string, type: DetectedField['type'] = 'text', required = false): DetectedField {
  return {
    selector: `input[name="${label}"]`,
    label,
    type,
    required,
    options: [],
    placeholder: null,
    max_length: 0,
    accepts: null,
  };
}

const mockProfile: UserProfile = {
  personal: {
    full_name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    phone: '+919999999999',
    phone_without_code: '9999999999',
    linkedin_url: 'https://linkedin.com/in/test',
    portfolio_url: null,
    github_url: null,
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    country_code: 'IN',
    pincode: '560001',
    current_ctc: 1200000,
    expected_ctc: 1500000,
    current_ctc_lpa: '12',
    expected_ctc_lpa: '15',
    notice_period_days: 30,
    notice_period_label: '30 days',
    willing_to_relocate: true,
    gender: 'Male',
    date_of_birth: '1995-01-01',
  },
  resume: {
    signed_url: 'https://cdn.example.com/resume.pdf',
    filename: 'Test_User_Resume.pdf',
    size_bytes: 245000,
    text_content: 'Test resume content',
  },
  experience: [],
  education: [],
  skills: ['React', 'TypeScript'],
  total_experience_years: 5,
  total_experience_months: 62,
  work_authorization: {
    authorized_in_india: true,
    requires_visa: false,
  },
};

const mockJob: JobQueueItem = {
  job_id: 'job-123',
  match_score: 'high',
  title: 'Senior Engineer',
  company: 'Acme',
  apply_url: 'https://example.com/apply',
  job_description: 'Build things',
  ats_hint: null,
  already_applied: false,
  pregenerated: {
    cover_letter: 'I am excited...',
    qa_bank: [
      { question_pattern: 'salary|compensation', answer: '15 LPA' },
      { question_pattern: 'notice|join', answer: '30 days' },
    ],
  },
};

describe('fieldMapper.mapFields', () => {
  it('maps full name deterministically', () => {
    const fields = [makeField('full name')];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBe('Test User');
    expect(mappings[0].source).toBe('deterministic');
  });

  it('maps email deterministically', () => {
    const fields = [makeField('email address')];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBe('test@example.com');
  });

  it('maps QA bank patterns', () => {
    const fields = [makeField('compensation')];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBe('15 LPA');
    expect(mappings[0].source).toBe('qa_bank');
  });

  it('marks unmapped fields', () => {
    const fields = [makeField('favorite color')];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBeNull();
    expect(mappings[0].source).toBe('unmapped');
  });

  it('auto-accepts consent checkboxes', () => {
    const fields = [makeField('i agree to terms', 'checkbox', true)];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBe(true);
  });

  it('maps willing_to_relocate radio', () => {
    const fields = [makeField('willing to relocate', 'radio')];
    const mappings = fieldMapper.mapFields(fields, mockJob, mockProfile);
    expect(mappings[0].value).toBe('Yes');
  });
});
