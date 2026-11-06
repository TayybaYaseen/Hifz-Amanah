# @hifz/i18n-keys

Localization shared by the app and the server (F11; ARCHITECTURE.md §14).

| File | What it holds |
|---|---|
| `src/glossary.ts` | Domain terms (Sabaq, Sabqi, Manzil, Para, Rubu, Salasah, …) in `en`, `ur`, `ur-Latn`, plus misspellings to reject (FR-I18N-008) |
| `src/labels.ts` | Labels for canonical values: sections, units, Para fractions, recitation and attendance statuses, the Quality Rating Scale. `optionsOf()` gives pickers the same values in every language (F11-AC6) |
| `src/server.ts` | Messages the server renders: email now; PDF (F13), Excel (F14), and push (F16) labels are added here |
| `src/catalogue.ts` | `checkCatalogues()` (missing, empty, extra, placeholder mismatch), English fallback, log-once |
| `src/bidi.ts` | `isolate`, `isolateLtr`, `surahRange` ("البقرة 2:255–260" readable in LTR and RTL) |
| `src/digits.ts` | Number, date, and time formatting with Western digits in every language (FR-I18N-009) |

`npm test` fails on any catalogue gap in the app or the server (`catalogue.test.ts`, F11-AC11).

**Glossary status: DRAFT.** The product owner, or a reviewer they nominate, approves the glossary and the Urdu and
Roman Urdu wording before release (DEC-B39, SRS §17.3). Only the Quality Rating Scale labels are already approved
(FR-ATT-009).
