// Organization contracts shared by the API and the app (F02; FR-ORG-001…007, FR-SEC-003/009, SRS §17.1).
// Organization and role always come from the signed-in membership. Every request schema is strict, so a body
// that carries `organizationId`, `role`, or a scope field it should not is rejected (F02-AC9).
import { z } from 'zod';

export const ORGANIZATION_KINDS = ['INDIVIDUAL', 'MADRASA'] as const;
export type OrganizationKind = (typeof ORGANIZATION_KINDS)[number];

/** Possible first days of the reporting week (FR-CAL-006). Defaults to MONDAY. */
export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const DAILY_REPORT_MODES = ['SINGLE', 'MULTI_SESSION'] as const;
export type DailyReportMode = (typeof DAILY_REPORT_MODES)[number];

/** Defaults of a newly created madrasa (F02-AC1). The database applies the same defaults. */
export const DEFAULT_ORGANIZATION_SETTINGS = {
  timezone: 'Asia/Karachi',
  weekStart: 'MONDAY',
  dailyReportMode: 'SINGLE',
} as const satisfies { timezone: string; weekStart: WeekDay; dailyReportMode: DailyReportMode };

export const WORKSPACE_NAME_MAX = 100;

// ---------- Requests ----------

/**
 * Owner/Admin workspace settings (US-007). The daily-report mode belongs to F05 (US-019) and is not accepted here.
 * A blank name is reported as `fields.name: REQUIRED` and an unknown timezone as `fields.timezone: INVALID` by the
 * server, which checks both (F02-AC3).
 */
export const UpdateOrganizationRequest = z.strictObject({
  name: z.string().max(WORKSPACE_NAME_MAX).optional(),
  timezone: z.string().max(64).optional(),
  weekStart: z.enum(WEEK_DAYS).optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequest>;

/** Roles the Owner may move a member between: adding or removing an Admin (FR-ORG-007, F02-AC15). */
export const ROLE_CHANGE_ROLES = ['ADMIN', 'TEACHER'] as const;
export type RoleChangeRole = (typeof ROLE_CHANGE_ROLES)[number];
export const ChangeRoleRequest = z.strictObject({ role: z.enum(ROLE_CHANGE_ROLES) });
export type ChangeRoleRequest = z.infer<typeof ChangeRoleRequest>;

/** A Teacher's "all classes" flag, set by an Owner or Admin (FR-SEC-003, F02-AC14). */
export const SetAllClassesRequest = z.strictObject({ allClasses: z.boolean() });
export type SetAllClassesRequest = z.infer<typeof SetAllClassesRequest>;

// ---------- Responses ----------

export interface OrganizationSettingsResponse {
  id: string;
  name: string;
  kind: OrganizationKind;
  timezone: string;
  weekStart: WeekDay;
  dailyReportMode: DailyReportMode;
  /** Whether the caller may change these settings (Owner/Admin). The server enforces it regardless. */
  canEdit: boolean;
}

/** The message shown when a change would leave a madrasa without an Owner or Admin (F02 edge cases). */
export const LAST_ADMIN_MESSAGE = 'A madrasa needs at least one Admin';
