// Canonical, language-neutral values of the Hifz vocabulary (AGENTS.md §5, NFR-MNT-003). These are what is stored and
// sent; every language shows its own label for them (packages/i18n-keys), and switching language never changes them
// (FR-I18N-005). Rules about these values (quantities, eligibility, counting) live in packages/domain, not here.

/** Sabaq, Sabqi, and Manzil are independent sections of a daily report. */
export const SECTIONS = ['SABAQ', 'SABQI', 'MANZIL'] as const;
export type Section = (typeof SECTIONS)[number];

/** A quantity always has one of these units; there is no conversion between them (ADR-005, ADR-014). */
export const QUANTITY_UNITS = ['PARA', 'LINES', 'AYAT', 'PAGES'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

/** Named Para fractions: Rubu 1/4, Half 1/2, Salasah 3/4, Complete 1 (Sabqi and Manzil only). */
export const PARA_FRACTIONS = ['RUBU', 'HALF', 'SALASAH', 'COMPLETE'] as const;
export type ParaFraction = (typeof PARA_FRACTIONS)[number];

/** Recitation status of one portion. ABSENT, NOT_ASSIGNED, and PENDING are never failure. */
export const RECITATION_STATUSES = ['COMPLETED', 'PARTIAL', 'NOT_REMEMBERED', 'ABSENT', 'NOT_ASSIGNED', 'PENDING'] as const;
export type RecitationStatus = (typeof RECITATION_STATUSES)[number];

/** Attendance, stored separately from performance (FR-CAL-007). */
export const ATTENDANCE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'LEAVE', 'ABSENT'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Quality Rating Scale, lower is better (FR-ATT-009). Null (not recorded) is not one of these. */
export const QUALITY_SCORES = [1, 2, 3, 4, 5] as const;
export type QualityScore = (typeof QUALITY_SCORES)[number];
