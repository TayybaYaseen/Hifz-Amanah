// F15 · Analytics on the device (NFR-OFF-008; F15-AC2). Offline, or while changes on this device wait to sync, the
// Analytics screen builds the figures from this device's copy with the same @hifz/domain/analytics buildAnalytics()
// the server uses, from the same report inputs as the F09 provisional report. The sync state passed in makes the
// result `provisional` (last sync time and pending-change count). Nothing built here is stored or sent.
import type { StudentAnalyticsView } from '@hifz/contracts';
import { buildAnalytics } from '@hifz/domain/analytics';
import type { SqlExecutor } from '../../local-db/driver.ts';
import { deviceReportInput, type DeviceReportArgs } from '../reports/local.ts';

export async function deviceAnalytics(db: SqlExecutor, args: DeviceReportArgs): Promise<StudentAnalyticsView> {
  return buildAnalytics(await deviceReportInput(db, args));
}
