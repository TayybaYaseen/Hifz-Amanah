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
// Results go to `output`: output.otp, output.totp, output.classDay, output.attendance, output.report.
/* global http, json, output, ACTION, LOGIN_ID, ADVANCE_MS, ORG_CODE, CLASS_NAME, CONTROL_URL, CONTROL_SECRET, STUDENT, SECTION, PARA, STATUS, UNIT, AMOUNT, COUNT, DATE, SCENARIO, KIND */
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
else throw new Error('Unknown ACTION ' + ACTION);
