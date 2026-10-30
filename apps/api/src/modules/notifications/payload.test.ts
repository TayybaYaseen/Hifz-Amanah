// F16 · Notifications — unit (docs/specs/17-f16-notifications/)
import { describe, it } from 'vitest';

describe('F16 · payload builder', () => {
  it.todo('F16-AC3 (US-066) a push about a student has generic text and a deep link only, with no name, scores, or note text');
});

describe('F16 · recipients', () => {
  it.todo('F16-AC2 (US-066) one push is sent per registered device of the user');
  it.todo('F16-AC5 (US-066) a Parent with a revoked link receives no push for that child');
  it.todo('F16-AC8 (US-067) an event type turned off is filtered out');
  it.todo('F16 unit: duplicate events with the same event ID send one push');
});

describe('F16 · channels', () => {
  it.todo('F16-AC9 (US-067) only Android push is available; no email, SMS, or WhatsApp');
});
