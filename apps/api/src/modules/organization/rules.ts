// Workspace settings rules as pure functions (F02-AC2, AC3; FR-CAL-006).

/** An IANA time zone name such as `Asia/Karachi` or `UTC`. Offsets like `+05:00` are refused: they ignore DST rules. */
export function isIanaTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The workspace name as stored: surrounding whitespace removed. Empty means "required" (F02-AC3). */
export function normalizeWorkspaceName(value: string): string {
  return value.trim();
}

export interface SettingsChange<T> {
  from: T;
  to: T;
}

/**
 * The fields that actually change, as `{ field: { from, to } }`, for the audit summary.
 * Fields that are absent from `next`, or equal to the current value, are left out.
 */
export function settingsDiff<T extends Record<string, unknown>>(current: T, next: Partial<T>): Partial<{ [K in keyof T]: SettingsChange<T[K]> }> {
  const diff: Partial<{ [K in keyof T]: SettingsChange<T[K]> }> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    const to = next[key];
    if (to !== undefined && to !== current[key]) diff[key] = { from: current[key], to };
  }
  return diff;
}
