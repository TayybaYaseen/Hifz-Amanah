// Puts the F14 Excel workbooks on the Android device, where the Maestro flows pick them in the system file picker
// (e2e/mobile/f14-excel). Maestro cannot copy files to a device, so this runs before the flows: `npm run e2e:mobile`
// and the spec gate (e2e/scripts/spec-gate.mjs) call it. SYNTHETIC DATA ONLY (e2e/fixtures/workbooks.ts).
//
//   node e2e/scripts/push-workbooks.mjs            (adb from PATH, or ANDROID_SERIAL / ADB to choose)
//
// The DailyRecords workbook is dated last week's Monday in Asia/Karachi, the day the IMPORT seed scenario marks
// attendance (apps/api/src/testing/report-seed.ts). Files go to /sdcard/Download/hifz-e2e, replacing older copies,
// and the media store is rescanned so the picker's Recent view lists them.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { weekOf } from '@hifz/domain/calendar';
import { addDays, calendarDateIn } from '@hifz/domain/roster';
import { mobileWorkbooks } from '../fixtures/workbooks.ts';

const DEVICE_DIR = '/sdcard/Download/hifz-e2e';
const adbPath = process.env.ADB ?? 'adb';

function adb(...args) {
  const res = spawnSync(adbPath, args, { encoding: 'utf8' });
  if (res.error || res.status !== 0) {
    throw new Error(`adb ${args.join(' ')} failed: ${res.error?.message ?? (res.stderr || res.stdout).trim()}`);
  }
  return res.stdout;
}

const today = calendarDateIn(new Date(), 'Asia/Karachi');
const recordDate = weekOf(addDays(today, -7)).from;
const files = await mobileWorkbooks(recordDate);

const dir = mkdtempSync(join(tmpdir(), 'hifz-workbooks-'));
try {
  adb('wait-for-device');
  adb('shell', `rm -rf ${DEVICE_DIR} && mkdir -p ${DEVICE_DIR}`);
  for (const [name, bytes] of Object.entries(files)) {
    const local = join(dir, name);
    writeFileSync(local, bytes);
    adb('push', local, `${DEVICE_DIR}/${name}`);
  }
  adb('shell', 'content', 'call', '--method', 'scan_volume', '--uri', 'content://media', '--arg', 'external_primary');
  console.log(`Pushed ${Object.keys(files).length} F14 workbooks to ${DEVICE_DIR} (DailyRecords dated ${recordDate}).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
