# Excel workbook fixtures

The F14 E2E tests build these workbooks from synthetic data at test time (exceljs), following the
SRS §15.1 template contract. Do not commit real workbooks or real student names.

| File | Sheet | Contents | Used by |
|---|---|---|---|
| `students-50.xlsx` | Students | 50 rows, `ExternalStudentID` EXT-I-001…050, synthetic names | F14-AC1, F14-AC4 |
| `students-1001.xlsx` | Students | 1,001 rows | F14-AC2 |
| `students-old-version.xlsx` | Students | Previous template version marker | F14-AC3 |
| `students-missing-name.xlsx` | Students | No `StudentName` column | F14-AC3 |
| `students-mixed.xlsx` | Students | 1 new, 1 exact match, 1 name-only match of S1 (suspected duplicate), 1 bad date, 1 bad status, 2 rows with the same `ExternalStudentID` | F14-AC5, F14-AC11, F14-AC12 |
| `students-renamed.xlsx` | Students | `EXT-A-001` with a different name | F14-AC13, F14-AC14 |
| `students-formula.xlsx` | Students | Names `=1+1`, `+cmd`, `-2`, `@SUM(A1)`, and a tab/CR prefix | F14-AC18 |
| `students-org-column.xlsx` | Students | Extra `organization_id` column naming Madrasa B | F14-AC8 |
| `daily-records-s1.xlsx` | DailyRecords | Dated last week's Monday: 6 rows for S1 (Sabaq 2:1–10, three Sabqi Para 3 with `MistakeCount = 3`, an empty `QualityRating`, and a private `TeacherNotes`; Manzil Paras 10 and 11), 1 row for S2, 1 for S3 (Hifz A2), 1 for `EXT-B-001` | F14-AC6, F14-AC7, F14-AC16, F14-AC17 (mobile) |
| `daily-records-sabaq.xlsx` | DailyRecords | 4 rows: a valid `SABAQ` row (Al-Baqarah 1–10, `TotalLines` 10, `LINES`); a `SABAQ` row with `HALF`; a `SABAQ` row without `AyahEnd`; a `SABQI` row with `SALASAH` | F14-AC23 |
| `daily-records-batches.xlsx` | DailyRecords | 600 rows: 3 commit batches of 200 (FR-XLS-018) | F14-AC15 |
| `students-two-classes.xlsx` | Students | 4 rows for Hifz A1 and 2 rows for Hifz A2 (imported by teacher.a1, who teaches only A1) | F14-AC21 |
| `students-no-meta.xlsx` | Students | No hidden `_meta` sheet | F14-AC22 |
| `students-1000.xlsx` | Students | 1,000 valid rows (5 batches of 200) | F14-AC22 |

Every workbook carries a hidden `_meta` sheet with `TemplateName` and `TemplateVersion` (FR-XLS-018). `students-no-meta.xlsx` omits it, for F14-AC22.

## On the device (mobile flows)

The API tests build their workbooks in memory. The Maestro flows in `e2e/mobile/f14-excel` pick files in Android's
file picker instead, and Maestro cannot copy files to a device, so `node e2e/scripts/push-workbooks.mjs` builds
`mobileWorkbooks()` (`workbooks.ts`: `students-50`, `students-1001`, `students-missing-name`, `students-mixed`,
`students-renamed`, `students-two-classes`, and `daily-records-s1`) and pushes them with `adb` to
`/sdcard/Download/hifz-e2e`. `npm run e2e:mobile` and the gate (for F14 flows) run it first; run it yourself before
`maestro test` on a single flow. `daily-records-s1.xlsx` is dated last week's Monday (Asia/Karachi), the day the
`IMPORT` seed scenario marks S1, S2, and S3 Present, so push it again in a new week.
