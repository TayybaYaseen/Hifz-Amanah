// Design tokens from design.md §2. Components use these; never hard-code colors, spacing, or radii.
export const colors = {
  brandPrimary: '#116747',
  brandDeep: '#20342C',
  brandGold: '#C6A45A',
  canvas: '#FAF8F0',
  surface: '#FFFFFF',
  surfaceSelected: '#E5F1E9',
  border: '#E5E9E2',
  textPrimary: '#1F2924',
  textSecondary: '#66736B',
  textOnPrimary: '#FFFFFF',
  success: '#287A4B',
  warning: '#9A6700',
  danger: '#B42318',
  info: '#245CB5',
  neutral: '#66736B',
} as const;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const radius = { input: 12, card: 16, sheet: 20, pill: 999 } as const;

export const touch = { minimum: 44, preferred: 48 } as const;

/** Phone horizontal inset. */
export const inset = 16;

export const type = {
  screenTitle: { fontSize: 24, lineHeight: 28, fontWeight: '600' },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20 },
  helper: { fontSize: 12, lineHeight: 16 },
  button: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
} as const;

/** Nastaliq needs taller lines than Latin text (design.md §2.3). */
export const NASTALIQ_LINE_HEIGHT_FACTOR = 1.9;

/** Naskh Arabic (Quranic text, Surah names) needs room for its diacritics. */
export const NASKH_LINE_HEIGHT_FACTOR = 1.7;
