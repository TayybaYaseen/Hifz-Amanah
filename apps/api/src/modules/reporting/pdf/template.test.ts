// F13 · PDF and print — unit: template rendering (docs/specs/16-f13-pdf-print/)
import { describe, it } from 'vitest';

describe('F13 · content', () => {
  it.todo('F13-AC1 (US-055) the rendered report has type, date range, timezone, section details, quantities with units, statuses, and authorized remarks');
  it.todo('F13-AC4 (US-055) quality scores render as number + label from the approved scale in the report language');
  it.todo('F13-AC3 (US-055) Arabic Surah names are identical to the stored text and use the Quranic font');
  it.todo('F13-AC10 (US-057) a Parent PDF is rendered from the PARENT projection with no internal notes');
});

describe('F13 · layout', () => {
  it.todo('F13-AC2 (US-055) an Urdu report renders right to left');
  it.todo('F13-AC5 (US-055) table headers repeat on each page and rows never split across pages');
});

describe('F13 · templates', () => {
  it.todo('F13-AC6 (US-056) the madrasa logo, colors, and headings are applied');
  it.todo('F13-AC8 (US-056) a customized template produces the same numbers and content as the default');
  it.todo('F13-AC9 (US-056) a logo that is too large or not an image is rejected');
});
