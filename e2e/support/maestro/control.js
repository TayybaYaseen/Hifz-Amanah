// Maestro script: calls the test-control API (NFR-MNT-005; apps/api/README.md "Test control").
// Maestro runs scripts on the host, so the default address is localhost, not the emulator's 10.0.2.2.
// Env: ACTION (reset | otp | totp | clock | quranSeed | legacyAttempt | ensureClassDay | dropAckNext | dropAckLeft | attendanceRecords), LOGIN_ID, ADVANCE_MS, ORG_CODE, CONTROL_URL, CONTROL_SECRET.
// legacyAttempt (F08-AC4): ORG_CODE (required; external IDs are unique per madrasa only), STUDENT (external ID), SECTION,
// PARA, STATUS, UNIT, AMOUNT plant a SYNTHETIC attempt whose completed unit differs from the portion's assigned unit on
// that student's newest matching lesson portion in that madrasa.
// quranSeed applies the SYNTHETIC Quran fixture (never real Quran data) to a madrasa (F06).
// ensureClassDay: ORG_CODE and CLASS_NAME; when today is not one of that class's weekdays (a Sunday for the Mon–Sat
// fixtures), the madrasa's Admin adds today's weekday from today on through the real schedule service. Sets
// output.classDay (today, YYYY-MM-DD).
// dropAckNext (F04-AC10): COUNT (default 1); the next COUNT successful sync pushes are committed by the server and
// then answered 503, as if the acknowledgement were lost, so the app retries operations the server already holds.
// dropAckLeft: sets output.dropAckLeft, the dropped acknowledgements still armed (0 once a push met it).
// attendanceRecords (F04-AC10): ORG_CODE, CLASS_NAME, DATE; sets output.attendance to a list of
// "<externalStudentId>:<status>:<ATTENDANCE_RECORDED audit count>" joined by ",", one item per stored record.
// reportSeed (F09): SCENARIO (WEEK | MONTH | SUMMARY) writes a synthetic report scenario through the real API
// (apps/api/src/testing/report-seed.ts); sets output.report (from, to, and the scenario's named dates).
// reportCorrect (F09-AC3): another device corrects the WEEK scenario's Tuesday rating 3 → 5.
// reportSeed SCENARIO=PORTAL (F10): S1 last week with a "Private to staff" and a "Visible to student/guardian" remark.
// reportPublish (F10-AC13): KIND (WEEK | MONTH, default WEEK), DATE (default a week ago); admin.a publishes that period
// for class Hifz A1 through the real API; sets output.published (count, from, to).
// reportSeed SCENARIO=IMPORT (F14): S1, S2 (Hifz A1) and S3 (Hifz A2) Present last week's Monday (output.report.date),
// the RecordDate of the pushed daily-records-s1.xlsx (e2e/scripts/push-workbooks.mjs).
// lastExport (F14-AC16, F14-AC17): sets output.exported to the newest EXPORT_CREATED audit summary (kind, rows,
// audience, includesPrivate; never student details), or null when there is none.
// analyticsSeed (F15): S1 last week as teacher-a1 through the real API (ratings 4, 4, 3, none, 2, 1: improving, with a
// gap); sets output.analytics (from, to, gapIndex). aiSettings (F15): admin-a saves AI settings through the real API
// (ENABLED, MONTHLY_CAP); aiStub: MODE sets the AI provider stub (timeout uses a 50 ms gateway timeout); aiStubInfo:
// output.ai (calls, hasAttendance of the last payload); auditCount: AUDIT_ACTION → output.auditCount.
// Results go to `output`: output.otp, output.totp, output.classDay, output.attendance, output.report, output.exported.
/* global http, json, output, ACTION, LOGIN_ID, ADVANCE_MS, ORG_CODE, CLASS_NAME, CONTROL_URL, CONTROL_SECRET, STUDENT, SECTION, PARA, STATUS, UNIT, AMOUNT, COUNT, DATE, SCENARIO, KIND, MODE, ENABLED, MONTHLY_CAP, AUDIT_ACTION */
var base = (typeof CONTROL_URL !== 'undefined' && CONTROL_URL ? CONTROL_URL : 'http://localhost:3000') + '/__test/';
var secret = typeof CONTROL_SECRET !== 'undefined' && CONTROL_SECRET ? CONTROL_SECRET : 'local-e2e-control-secret';
var headers = { 'x-test-control-secret': secret, 'Content-Type': 'application/json' };

function call(method, path, body) {
  var response = method === 'GET'
    ? http.get(base + path, { headers: headers })
    : http.post(base + path, { headers: headers, body: JSON.stringify(body || {}) });
  if (!response.ok) throw new Error('test control ' + path + ' failed: ' + response.status);
  return json(response.body);
}

if (ACTION === 'reset') call('POST', 'reset');
else if (ACTION === 'otp') output.otp = call('GET', 'otp/' + LOGIN_ID).otp;
// totp asks for the next step's code: the server's ±1-step drift accepts it now and for 60–90 s, so slow typing on
// an emulator does not outlast it.
else if (ACTION === 'totp') output.totp = call('GET', 'totp/' + LOGIN_ID + '?prefer=next').code;
else if (ACTION === 'clock') call('POST', 'clock', { advanceMs: Number(ADVANCE_MS) });
else if (ACTION === 'quranSeed') call('POST', 'quran/seed', { organizationCode: typeof ORG_CODE !== 'undefined' && ORG_CODE ? ORG_CODE : 'ALIF' });
else if (ACTION === 'legacyAttempt') {
  if (typeof ORG_CODE === 'undefined' || !ORG_CODE) throw new Error('legacyAttempt needs ORG_CODE');
  var portion = call('POST', 'hifz/lesson-portion-lookup', { organizationCode: ORG_CODE, externalStudentId: STUDENT, section: SECTION, paraNumber: PARA ? Number(PARA) : null });
  output.attemptId = call('POST', 'hifz/legacy-attempt', { lessonPortionId: portion.id, status: STATUS, completed: { unit: UNIT, numerator: Number(AMOUNT), denominator: 1 } }).id;
}
else if (ACTION === 'ensureClassDay') {
  if (typeof ORG_CODE === 'undefined' || !ORG_CODE || typeof CLASS_NAME === 'undefined' || !CLASS_NAME) throw new Error('ensureClassDay needs ORG_CODE and CLASS_NAME');
  output.classDay = call('POST', 'calendar/ensure-class-day', { organizationCode: ORG_CODE, className: CLASS_NAME }).date;
}
else if (ACTION === 'dropAckNext') call('POST', 'sync/drop-ack-next', { count: typeof COUNT !== 'undefined' && COUNT ? Number(COUNT) : 1 });
else if (ACTION === 'dropAckLeft') output.dropAckLeft = call('GET', 'sync/drop-ack-next').left;
else if (ACTION === 'attendanceRecords') {
  if (typeof ORG_CODE === 'undefined' || !ORG_CODE || typeof CLASS_NAME === 'undefined' || !CLASS_NAME || typeof DATE === 'undefined' || !DATE) throw new Error('attendanceRecords needs ORG_CODE, CLASS_NAME and DATE');
  output.attendance = call('POST', 'attendance/records', { organizationCode: ORG_CODE, className: CLASS_NAME, date: DATE }).items
    .map(function (r) { return r.externalStudentId + ':' + r.status + ':' + r.recordedAudits; }).join(',');
}
else if (ACTION === 'reportSeed') output.report = call('POST', 'reports/seed', { scenario: SCENARIO });
else if (ACTION === 'reportCorrect') call('POST', 'reports/correct');
else if (ACTION === 'reportPublish') {
  var publishBody = { kind: typeof KIND !== 'undefined' && KIND ? KIND : 'WEEK' };
  if (typeof DATE !== 'undefined' && DATE) publishBody.date = DATE;
  output.published = call('POST', 'reports/publish', publishBody);
}
else if (ACTION === 'lastExport') {
  var exportAudits = call('GET', 'audit-action/EXPORT_CREATED').items;
  output.exported = exportAudits.length ? exportAudits[exportAudits.length - 1].summary : null;
}
else if (ACTION === 'analyticsSeed') output.analytics = analyticsSeed();
else if (ACTION === 'aiSettings') output.aiSettings = aiSettings();
else if (ACTION === 'aiStub') {
  var stubBody = { mode: typeof MODE !== 'undefined' && MODE ? MODE : 'ok' };
  if (stubBody.mode === 'timeout') stubBody.timeoutMs = 50;
  call('POST', 'ai/stub', stubBody);
}
else if (ACTION === 'aiStubInfo') {
  var stub = call('GET', 'ai/stub');
  output.ai = { calls: stub.calls, hasAttendance: !!(stub.lastPayload && stub.lastPayload.attendance), subject: stub.lastPayload ? stub.lastPayload.subject : null };
}
else if (ACTION === 'auditCount') output.auditCount = call('GET', 'audit-action/' + AUDIT_ACTION).items.length;
else throw new Error('Unknown ACTION ' + ACTION);

// ---------- F15 helpers (the real API, as the app would call it) ----------

function apiBase() {
  return typeof CONTROL_URL !== 'undefined' && CONTROL_URL ? CONTROL_URL : 'http://localhost:3000';
}

function api(method, path, token, body) {
  var h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  var response = http.request(apiBase() + path, { method: method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw new Error(method + ' ' + path + ' failed: ' + response.status + ' ' + response.body);
  return json(response.body);
}

/** Signs a seeded persona in through the API (completing two-factor sign-in for Owner/Admin); returns the access token. */
function signInApi(loginId) {
  var body = api('POST', '/auth/sign-in', null, { loginId: loginId, password: 'E2e-Test-Pass-1' });
  if (body.step === 'TWO_FACTOR_REQUIRED') {
    body = api('POST', '/auth/two-factor/verify', null, { challengeToken: body.challengeToken, code: call('GET', 'totp/' + loginId).code });
  }
  if (body.step !== 'SIGNED_IN') throw new Error('sign-in as ' + loginId + ' stopped at ' + body.step);
  return body.accessToken;
}

function hex(n) {
  var s = '';
  for (var i = 0; i < n; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** A UUIDv7 (time-ordered), as the app generates for offline-created entities. */
function uuidv7() {
  var ms = Date.now().toString(16);
  while (ms.length < 12) ms = '0' + ms;
  return ms.slice(0, 8) + '-' + ms.slice(8, 12) + '-7' + hex(3) + '-' + '89ab'.charAt(Math.floor(Math.random() * 4)) + hex(3) + '-' + hex(12);
}

function addDaysTo(date, days) {
  var d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * analyticsSeed (F15): S1 last week, written by teacher-a1 through POST /sync/push. SYNTHETIC: Sabqi Para 5, one
 * portion a day Monday–Saturday, ratings 4, 4, 3, (none), 2, 1 — a falling average (improvement, lower is better) with
 * a gap on Thursday — and a Tajweed mistake on Monday and Tuesday. Sets output.analytics { from, to, gapIndex }.
 */
function analyticsSeed() {
  var token = signInApi('teacher-a1');
  var ids = call('GET', 'roster/ids');
  // Today in Asia/Karachi (UTC+5, no daylight saving); last week's Monday.
  var today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  var weekday = new Date(today + 'T00:00:00Z').getUTCDay() || 7;
  var monday = addDaysTo(today, -(weekday - 1) - 7);
  var ratings = [4, 4, 3, null, 2, 1];
  var device = '0190f5c0-0000-4000-8000-0000000000f5';
  var seq = 0;
  var op = function (entity, fields) {
    seq += 1;
    return { opId: uuidv7(), seq: seq, entity: entity, entityId: uuidv7(), opType: 'CREATE', baseVersion: null, fields: fields, dependsOn: [], clientSavedAt: new Date().toISOString() };
  };
  for (var i = 0; i < ratings.length; i++) {
    var date = addDaysTo(monday, i);
    var attendance = op('attendance_record', { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: date, status: 'PRESENT', leaveReason: null, absentNote: null });
    var record = op('daily_record', { studentId: ids.students.S1, classId: ids.classes.A1, reportDate: date, sessionLabel: null });
    var portion = op('lesson_portion', { dailyRecordId: record.entityId, section: 'SABQI', position: 1, isExtra: false, paraNumber: 5, range: null, totalLines: null, totalLinesSource: null, assigned: { unit: 'PARA', numerator: 1, denominator: 1 } });
    var attempt = op('portion_attempt', {
      lessonPortionId: portion.entityId, attemptNo: 1, attemptedAt: new Date().toISOString(), status: 'COMPLETED',
      completed: { unit: 'PARA', numerator: 1, denominator: 1 }, quality: ratings[i], noMistakes: i >= 2,
      mistakes: i < 2 ? [{ category: 'TAJWEED', severity: 'MINOR', repeated: false }] : [], remarks: null,
    });
    var res = api('POST', '/sync/push', token, { protocolVersion: 1, deviceId: device, ops: [attendance, record, portion, attempt] });
    for (var j = 0; j < res.results.length; j++) {
      if (res.results[j].status !== 'APPLIED') throw new Error('analyticsSeed: ' + JSON.stringify(res.results[j]));
    }
  }
  return { from: monday, to: addDaysTo(monday, 6), gapIndex: 4 };
}

/**
 * aiSettings (F15): admin-a saves the madrasa's AI settings through PUT /analytics/ai-settings (audited like the app's
 * save). ENABLED (default true) and MONTHLY_CAP (default none). Provider: the test stub (DEC-B45 is Deferred).
 */
function aiSettings() {
  var token = signInApi('admin-a');
  var enabled = typeof ENABLED === 'undefined' || ENABLED === '' || ENABLED === 'true';
  return api('PUT', '/analytics/ai-settings', token, {
    enabled: enabled,
    provider: 'test-stub',
    monthlyRequestCap: typeof MONTHLY_CAP !== 'undefined' && MONTHLY_CAP ? Number(MONTHLY_CAP) : null,
    teacherDailyCap: 20,
    monthlyBudgetMicroUsd: 10000000,
    categories: { ATTENDANCE: true, PROGRESS: true, MISTAKES: true, QUALITY: true, HOMEWORK: true },
  }).enabled;
}
