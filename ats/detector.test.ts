import { describe, it, expect } from 'vitest';
import { detectATS } from './detector';

describe('ATS Detector', () => {
  function createDoc(html: string): Document {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  it('detects Greenhouse from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://boards.greenhouse.io/acme/jobs/123', doc)).toBe('greenhouse');
  });

  it('detects Lever from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://jobs.lever.co/acme/abc-123', doc)).toBe('lever');
  });

  it('detects Workday from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.wd3.myworkdayjobs.com/en-US/job/123', doc)).toBe('workday');
  });

  it('detects Zoho from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.zohorecruit.com/jobs/Careers/123', doc)).toBe('zoho');
  });

  it('detects Darwinbox from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.darwinbox.com/job/123', doc)).toBe('darwinbox');
  });

  it('detects Keka from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.keka.com/careers/job/123', doc)).toBe('keka');
  });

  it('detects Freshteam from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.freshteam.com/jobs/123', doc)).toBe('freshteam');
  });

  it('detects SAP SuccessFactors from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://career4.successfactors.com/career?jobId=123', doc)).toBe('successfactors');
  });

  it('detects LinkedIn from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://www.linkedin.com/jobs/view/1234567890/', doc)).toBe('linkedin');
  });

  it('detects Indeed from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://www.indeed.com/viewjob?jk=abc123', doc)).toBe('naukri_indeed');
  });

  it('detects Naukri from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://www.naukri.com/job-listings-abc-123', doc)).toBe('naukri_indeed');
  });

  it('detects Taleo from URL', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://acme.taleo.net/careersection/jobdetail.ftl?job=123', doc)).toBe('taleo');
  });

  it('falls back to generic for unknown URLs', () => {
    const doc = createDoc('<html></html>');
    expect(detectATS('https://example.com/apply', doc)).toBe('generic');
  });

  it('detects from DOM signals when URL is ambiguous', () => {
    const doc = createDoc('<html><body class="freshteam">apply</body></html>');
    expect(detectATS('https://example.com/apply', doc)).toBe('freshteam');
  });

  it('detects LinkedIn from DOM signals', () => {
    const doc = createDoc('<html><head></head><body><div class="jobs-easy-apply-modal"></div></body></html>');
    expect(detectATS('https://example.com/job', doc)).toBe('linkedin');
  });

  it('detects SAP SuccessFactors from DOM signals', () => {
    const doc = createDoc('<html><body><div data-sf-field="name"></div></body></html>');
    expect(detectATS('https://example.com/job', doc)).toBe('successfactors');
  });

  it('detects from meta generator tag', () => {
    const doc = createDoc('<html><head><meta name="generator" content="Greenhouse"></head></html>');
    expect(detectATS('https://example.com/job', doc)).toBe('greenhouse');
  });
});
