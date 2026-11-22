// App-wide: internal teacher notes never reach Student or Parent audiences on any channel.
// SRS §10.5 AC-SEC-04; AGENTS.md §6 ("Add a test for every new outbound channel").
import { addDays, applied, op, para, portionOp, presentRecord, today, uuidv7 } from '../support/daily-entry';
import { expect, test } from '../support/fixtures';

// A unique marker written into a private note before each check, then searched for in raw output.
const PRIVATE_MARKER = 'E2E-PRIVATE-NOTE-7f3a';

test.describe('APP · Internal-note leak sweep', { tag: '@APP' }, () => {
  test('APP-NOTE-01 (AC-SEC-04) report API responses for Student and Parent omit the private note', async ({ as, control }) => {
    // F10 portal: the only report API open to Students and Parents. A private remark and an internal mistake note carry
    // the marker; the week and the month are published; every Student and Parent response is searched raw.
    const ids = await control.rosterIds();
    await control.seedSyntheticQuran();
    const teacher = await as('teacher.a1');
    const date = addDays(today(), -7);
    const rec = await presentRecord(teacher, ids, 'S1', new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? addDays(date, -1) : date);
    const p = await applied(teacher, portionOp(rec, { section: 'SABQI', paraNumber: 4, assigned: para(1) }));
    await applied(
      teacher,
      op('portion_attempt', 'CREATE', uuidv7(), {
        lessonPortionId: p.id,
        attemptNo: 1,
        attemptedAt: new Date().toISOString(),
        status: 'PARTIAL',
        completed: para(1, 2),
        quality: 3,
        noMistakes: false,
        mistakes: [{ category: 'TAJWEED', severity: 'MAJOR', repeated: false, note: PRIVATE_MARKER, noteVisibility: 'INTERNAL' }],
        remarks: PRIVATE_MARKER,
      }),
    );
    for (const kind of ['WEEK', 'MONTH']) {
      const res = await teacher.post('/reports/publish', { data: { kind, date, classId: ids.classes.A1, pendingChanges: 0 } });
      expect(res.status(), await res.text()).toBe(200);
    }
    for (const who of ['student.s1', 'parent.p1'] as const) {
      const api = await as(who);
      const listed = await api.get(`/portal/reports?studentId=${ids.students.S1}`);
      const items = (await listed.json()).items as { id: string }[];
      expect(items.length, who).toBeGreaterThanOrEqual(2);
      const bodies = [await api.get('/portal/students'), listed, ...(await Promise.all(items.map((i) => api.get(`/portal/reports/${i.id}`))))];
      for (const res of bodies) expect((await res.body()).toString('latin1'), `${who} ${res.url()}`).not.toContain(PRIVATE_MARKER);
    }
  });

  test.fixme('APP-NOTE-02 (AC-SEC-04) Student and Parent PDFs omit the private note', async () => {
    // Generate PDFs as student.s1 and parent.p1; extracted text excludes PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-03 (AC-XLS-06) Student and Parent audience exports omit the private note', async () => {
    // Export for those audiences; no cell contains PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-04 push payloads omit the private note', async () => {
    // Trigger every push event type for S1; control.pushesFor(parent.p1) payloads exclude PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-05 AI request payloads omit notes by default', async () => {
    // Request an AI recommendation for S1; the stub-received payload excludes PRIVATE_MARKER.
  });

  test.fixme('APP-NOTE-06 the channel inventory matches every outbound channel', async () => {
    // Fail if a channel exists (API audience, PDF, Excel, push, AI) without a check in this file.
  });
});
