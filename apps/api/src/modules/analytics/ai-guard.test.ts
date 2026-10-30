// F15 · Analytics and AI recommendations — unit: AI request and response guards (docs/specs/15-f15-analytics-ai/)
import { describe, it } from 'vitest';

describe('F15 · payload minimizer', () => {
  it.todo('F15-AC13 (US-065) the default payload has no student name, contact details, or notes; the student is a pseudonym');
  it.todo('F15-AC14 (US-065) a data category turned off by the Admin is absent from the payload');
  it.todo('F15-AC15 (US-065) the stored usage record holds the minimized payload and an input hash only');
});

describe('F15 · response validator', () => {
  it.todo('F15-AC7 (US-063) a response that fails the schema is discarded');
  it.todo('F15-AC7 (US-063) a response citing a number not in the sent metrics is discarded');
});

describe('F15 · limits and access', () => {
  it.todo('F15-AC12 (US-064) at the usage limit, the request is refused and no provider call is made');
  it.todo('F15-AC11 (US-064) AI turned off refuses requests');
  it.todo('F15-AC9 (US-063) Student and Parent are refused');
  it.todo('F15-AC8 (US-063) handling a response never writes records, attempts, scores, or homework (AC-AI-03)');
});
