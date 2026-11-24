# F15 UI spec: Analytics and Settings → AI (wave 1)

Covers US-062…065, F15-AC1…AC18, FR-AI-001…014, NFR-OFF-008. Fills the two "design gaps" in design.md §13. Uses §2 tokens (`apps/mobile/src/theme/tokens.ts`), §5.8, §8. No new decisions: the AI vendor stays Deferred (DEC-B45). Never hard-code colours, spacing or radii.

Reuse: `AppScreen, AppText, Card, Button, Notice, Field, isolate` (`components/ui.tsx`), `SyncBanner, useFormatDateTime, SyncStateIcon` (`components/sync.tsx`), `StatusChip`, `Chip, ChipRow` (`features/roster/Chip`), `useAmount` (`daily-entry/PortionCard`), period logic `reportPeriod/shiftPeriod` from `@hifz/domain/reports`. Calculations come from `packages/domain/analytics`; screens only render.

New small components (in `features/analytics/`): `MetricBlock` (label, value, unit, date range, "Not recorded" for null; §5.8), `TrendChart` (see a11y), `AiPanel`, `Switch` row (if none exists, use RN `Switch` inside a 48 dp row).

---

## Screen 1: Analytics

**Purpose.** Show a student's (or class's) calculated trends first, then an optional, clearly separate AI explanation. Teacher/Admin/Owner only. Never reachable by Student/Parent (no tab, no route, no deep link; API also refuses, F15-AC9).

**Entry points / routes.**
- More → "Analytics" button, `testID more.analytics`, shown when `roster` (Owner/Admin/Teacher), route `Analytics` (title `analytics.title`).
- Reports screen, student mode: secondary button "View analytics" (`reports.viewAnalytics`), navigates `Analytics` with params `{ classId, studentId, kind, anchor }`.
- Opening from More starts with class + student pickers as in Reports (same `ChipRow` pickers; Teacher sees assigned classes only).

**Layout, top to bottom** (single scroll, `AppScreen testID="analytics.screen"`):
1. Pickers: class chips, student chips, then period `ChipRow` WEEK / MONTH, with prev/next arrows and the date range text (bidi-isolated).
2. `SyncBanner` / provisional banner (see states).
3. **Calculated metrics** section header "Calculated from your records" (`analytics.metricsHeader`). Cards in this order:
   1. Progress: three sub-cards Sabaq, Sabqi, Manzil (each with its own existing section colour/label). Each shows assigned vs completed per unit as separate lines ("Para: 3/4 of 1", "Lines: 40 of 60"). Never summed or compared across units. Sabqi/Manzil list per-Para portions independently.
   2. Mistake trend: by category (Harkaat, Tajweed, Lafzi, Ayat bhoolna, Tarteeb, Waqf/Ibtida) and by severity (Minor/Major). "Repeated" is a separate line, not a severity. Missing count reads "Not recorded", never 0; explicit "No mistakes" is 0.
   3. Quality trend chart plus summary line: average as exact number + nearest-score label (.5 rounds up) + count of ratings used. Axis: 1 · Excellent at TOP, 5 · Weak at BOTTOM. Null ratings are gaps (line broken, no point). A falling average reads "Improving" (`analytics.quality.improving`), rising reads "Needs more attention"; never "higher is better".
   4. Recurring difficult portions: list (Para/portion, times flagged, latest status). Empty → "None found in this period".
   5. Attendance context: Present/Late/Half day counts, Leave, Absent; labelled separate from recitation. Holidays/no-class days are not absences.
   6. Homework completion: confirmed homework completed / outstanding / carried over (never "failed").
4. **AI area** (visually separate, see below).

**Visual separation of the AI area.** Different surface: `surfaceSelected` background with a dashed `brandGold` border and a spark-free text icon label "AI" chip (text + icon, never colour alone), 24 dp (`space[6]`) gap above, header `analytics.ai.label`. Metrics cards use plain `surface`.

**AI area contents (state `ready`).**
- Header "AI suggestion — review required".
- Line "Period: {from} to {to}" and "Metrics used: {list}" (localized category names; each as a chip).
- Two sub-sections: "Observations" (what the numbers show) and "Suggestions" (what to consider). Cited numbers are bolded.
- Disclaimer (FR-AI-007): "This is an AI suggestion based on the records above. It is not a religious, medical or psychological judgment, and it is not guaranteed. Use your own judgment."
- No save/apply/confirm buttons: AI changes nothing (F15-AC8). Only "Get again" (secondary), subject to limits.

**AI state table** (the metrics stay on screen in every case; `testID analytics.ai.state` has the state name in `accessibilityValue`).

| State | Shown to | Treatment and exact English copy |
|---|---|---|
| `hidden` | AI off, or Student/Parent | Nothing at all: no button, no header (F15-AC11) |
| `idle` | Teacher/Admin, online, AI on, enough data | Button "Get AI recommendations" |
| `offline` | any staff, no network | Disabled button "AI needs a connection"; no AI text, no cached AI output (F15-AC5) |
| `loading` | after tap | Progress + "Getting AI recommendations…"; after 10 s adds "This is taking longer than usual…"; client gives up at 20 s → `error`. Button disabled; metrics stay usable |
| `ready` | success | AI area above |
| `notSetup` | Owner/Admin | "AI provider not set up" + button "Open AI settings" (route `AiSettings`) |
| `notSetup` | Teacher | "AI unavailable" (no reason, no settings link) |
| `error` | provider down / timeout / invalid output | "AI unavailable — try again later" + button "Try again" (`analytics.ai.retry`) |
| `limit` | cap reached | "AI limit reached for this period" (no retry; no provider call). Metrics unaffected (F15-AC12, AC18) |
| `insufficient` | too little data | AI button disabled with "Not enough data for AI suggestions" (no call); or if server returns `data_insufficient`, show its text under the AI header |

**Other states (§8).**
- Loading metrics: skeleton cards + "Loading analytics…".
- Empty / not enough data: single card "Not enough data for this period" + helper "Record more daily entries, or choose a longer period." (`analytics.notEnough`). Charts hidden; AI `insufficient`.
- No student chosen: "Choose a class and a student".
- Offline / provisional (F15-AC2, NFR-OFF-008): built on device with the same domain function. Banner (`testID analytics.provisional`): "Provisional · Last synced {time} · {count} changes waiting to sync". Last sync time is shown only if known ("Never synced" otherwise). Online with unsynced changes: same banner text variant "Server figures do not include {count} changes on this device yet." Unsynced changes are never shown as "Synced".
- Error: `Notice tone=error` with retry (`analytics.error`).
- Success: n/a (read-only).
- Permission revoked: "Your access to this class was removed. Analytics for it can no longer be shown." (`analytics.revoked`), data and pickers cleared.
- Session expired: handled by the app-wide sign-in prompt.

**Chart a11y and direction rules.**
- Every chart is paired with a text table/summary directly below (`analytics.chart.summary`: "Quality, {from} to {to}: average {avg} ({label}), based on {n} ratings. Best {min}, weakest {max}. {k} days not rated."), and a "Show values" toggle that expands a per-day list ("12 Nov: 2 · Good", "13 Nov: Not recorded"). The chart container has `accessible` + `accessibilityLabel` = the summary; plot marks are not individually focusable.
- Never colour alone: points use distinct marker shapes per series and a text label for Y-axis ticks ("1 · Excellent" … "5 · Weak"); trend direction is stated in words with an arrow icon ("Improving ↓ average" shows the numeric fall, then the word).
- **Chart direction rule:** time always runs oldest to newest in reading direction of the UI: left→right in `en`/`ur-Latn`, right→left in `ur` (mirror the X axis via `I18nManager.isRTL`/layout direction). The Y axis keeps 1 at the top in every locale; Y labels sit on the start side. Numerals stay in the digit style of the existing app. Mixed ranges/numbers (dates, Para ranges, "3/4") are wrapped with `isolate()`.
- Fonts scale with system font size; labels wrap, charts height grows with scale (min height by `fontScale`); touch targets ≥ 44 dp, buttons 48 dp.
- Quranic names (Surah/Para) are rendered verbatim with `QuranText`; never altered.
- AI area text is announced as "AI suggestion" first (`accessibilityRole="header"`).

**testIDs (Analytics).**
`analytics.screen`, `analytics.class.<id>`, `analytics.student.<id>`, `analytics.period.WEEK|MONTH`, `analytics.period.prev|next`, `analytics.range`, `analytics.provisional` (banner; children `analytics.provisional.lastSync`, `analytics.provisional.pending`), `analytics.notEnough`, `analytics.error`, `analytics.revoked`, `analytics.progress.SABAQ|SABQI|MANZIL`, `analytics.mistakes`, `analytics.mistakes.category.<CODE>`, `analytics.mistakes.repeated`, `analytics.quality`, `analytics.quality.chart`, `analytics.quality.summary`, `analytics.quality.axisTop` ("1 · Excellent"), `analytics.quality.axisBottom` ("5 · Weak"), `analytics.quality.gap.<n>`, `analytics.quality.trend`, `analytics.quality.showValues`, `analytics.difficult`, `analytics.attendance`, `analytics.homework`, `analytics.ai.button` (text = current label), `analytics.ai.state`, `analytics.ai.panel`, `analytics.ai.label`, `analytics.ai.range`, `analytics.ai.metrics`, `analytics.ai.observations`, `analytics.ai.suggestions`, `analytics.ai.disclaimer`, `analytics.ai.loading`, `analytics.ai.retry`, `analytics.ai.openSettings`, `analytics.ai.unavailable`, `analytics.ai.limit`, `analytics.ai.offline`.

Maestro mapping: journey 1 uses `analytics.provisional*`, `analytics.quality.axisTop/axisBottom/gap.*/trend`, `analytics.ai.button`, `analytics.ai.label`, `analytics.ai.range`, `analytics.ai.metrics`, `analytics.ai.unavailable`; the AI-settings journey uses `analytics.ai.limit` and the absence of `analytics.ai.button` (hidden state, F15-AC11, AC9).

---

## Screen 2: Settings → AI (Owner/Admin only)

**Purpose.** Admin chooses the provider, switches AI on/off, sets limits and which data categories may be shared (US-064, US-065).

**Entry / routes.** Route `AiSettings` (title `aiSettings.title`). Entry: More → "AI settings" (`more.aiSettings`, shown only when `staff` = Owner/Admin), and a row "AI settings" in `WorkspaceScreen` below Daily reports. Teacher/Student/Parent: no entry; if the route is reached anyway show `permissionRevoked`/read-only refusal ("Only the madrasa Owner or Admin can change AI settings.", reusing the `workspace.readOnlyNote` style). The server enforces it regardless.

**Layout** (`AppScreen testID="aiSettings.screen"`, style as `WorkspaceScreen`/`ReportModeControl`: `Card` per group, secondary Save button):
1. Intro helper: "AI gives optional suggestions based on calculated figures. It never changes records."
2. **Status card:** switch "Turn on AI" (`aiSettings.enabled`).
3. **Provider card:** radio-style `Chip` list from the server's supported list. Empty list: `Notice tone=info` "No AI provider is available yet" + helper "Your madrasa can turn AI on once a provider is added." Switch is disabled until a provider is chosen (the AI vendor is Deferred, DEC-B45: never name a vendor in copy; use the server's display names).
4. **Limits card:** (a) "Requests per month for the madrasa" (optional, integer > 0, empty = no extra limit), (b) "Requests per Teacher per day" (integer > 0), (c) "Monthly budget (USD)" decimal, max 10, may only be lowered: helper "Maximum USD 10. You can lower it, not raise it." The field shows dollars, e.g. `7.50`; client sends integer micro-USD (`Math.round(dollars*1e6)`, from the decimal string, no float maths on money beyond that conversion; reject more than 6 decimals).
5. **Data sharing card:** header "What AI can use". Five switches, all on by default: Attendance summary, Sabaq/Sabqi/Manzil progress, Mistake categories, Quality scores, Homework completion. Below, a fixed read-only row with lock icon (not a switch): "Never shared: names, contact details, notes" (FR-AI-013).
6. **Usage card:** "This month: {used} of {cap} requests · USD {spent} of {budget}" (cap omitted if none). Read-only.
7. Save button (`aiSettings.save`), success Notice "AI settings saved."

**States (§8 + extras).**
- Loading: skeleton + "Loading AI settings…".
- Empty provider list: as above (page still usable for limits? No: Save disabled with the notice).
- Offline: `Notice tone=info` "AI settings need a connection. Connect to the internet to view or change them." All inputs and Save disabled. Nothing queued offline.
- Saving: Save busy ("Saving…"); success Notice; failure Notice error with API message (`errorKeys`), form stays filled.
- Validation (inline, per field, on Save and blur): "Limits must be positive numbers" (`aiSettings.error.positive`, covers 0, negative, non-number); budget > 10 or above the saved value: "The budget can only be lowered, up to USD 10" (`aiSettings.error.budget`). Save blocked with focus moved to the first error.
- Permission revoked (role lost mid-session, 403): "Your access to AI settings was removed." and the form clears.
- Conflict (server changed since load): reload prompt using `errors` style; no silent overwrite.
- Unsaved changes survive language switch (controlled state in the screen).

**testIDs (AI settings).**
`aiSettings.screen`, `aiSettings.enabled`, `aiSettings.provider.<id>`, `aiSettings.noProvider`, `aiSettings.limit.monthly`, `aiSettings.limit.teacherDaily`, `aiSettings.budget`, `aiSettings.category.attendance|progress|mistakes|quality|homework`, `aiSettings.neverShared`, `aiSettings.usage`, `aiSettings.save`, `aiSettings.saved`, `aiSettings.error`, `aiSettings.offline`, `aiSettings.revoked`, `aiSettings.error.positive` (field error text), `aiSettings.error.budget`, `more.aiSettings`, `workspace.aiSettings`.

Maestro (`ai-settings.yaml`): step 1 = `more.aiSettings`, `aiSettings.provider.*`, `aiSettings.limit.teacherDaily` = 1, `aiSettings.category.attendance` off, assert `aiSettings.neverShared`, `aiSettings.save`, `aiSettings.saved`; step 2 = value 0 / -1 → `aiSettings.error.positive`; step 4 = `aiSettings.enabled` off.

**A11y.** Each switch row is one 48 dp target with `accessibilityRole="switch"`, `accessibilityState.checked`, label + helper read together. Errors use `accessibilityLiveRegion="polite"` and text, not colour only. Money and numbers are `isolate()`d and typed with a numeric keypad; Arabic digits input is accepted. RTL: rows mirror, switches on the end side. Fixed row announces "Never shared: names, contact details, notes".

---

## i18n keys

Style: nested objects in `apps/mobile/src/i18n/locales/{en,ur,ur-Latn}.ts`; `{param}` interpolation, double-quoted strings. Reuse existing quality-score labels, mistake categories, section names, attendance and period keys; do not duplicate them. Roman Urdu quality words follow AGENTS §5.7.

### `more` / `reports` additions
| Key | English | Urdu | Roman Urdu |
|---|---|---|---|
| `more.analytics` | Analytics | تجزیات | Tajziyaat |
| `more.aiSettings` | AI settings | اے آئی کی ترتیبات | AI ki tarteebaat |
| `reports.viewAnalytics` | View analytics | تجزیات دیکھیں | Tajziyaat dekhein |
| `workspace.aiSettings` | AI settings | اے آئی کی ترتیبات | AI ki tarteebaat |

### `analytics.*`
| Key | English | Urdu | Roman Urdu |
|---|---|---|---|
| `title` | Analytics | تجزیات | Tajziyaat |
| `choose` | Choose a class and a student | جماعت اور طالب علم منتخب کریں | Jamaat aur talib-e-ilm muntakhab karein |
| `metricsHeader` | Calculated from your records | آپ کے ریکارڈ سے حساب شدہ | Aap ke record se hisaab shuda |
| `loading` | Loading analytics… | تجزیات لوڈ ہو رہے ہیں… | Tajziyaat load ho rahe hain… |
| `notEnough` | Not enough data for this period | اس مدت کے لیے کافی ڈیٹا نہیں | Is muddat ke liye kafi data nahin |
| `notEnoughHelp` | Record more daily entries, or choose a longer period. | مزید روزانہ اندراجات کریں، یا لمبی مدت منتخب کریں۔ | Mazeed rozana indraajaat karein, ya lambi muddat muntakhab karein. |
| `error` | Analytics could not be loaded. Try again. | تجزیات لوڈ نہیں ہو سکے۔ دوبارہ کوشش کریں۔ | Tajziyaat load nahin ho sake. Dobara koshish karein. |
| `revoked` | Your access to this class was removed. Analytics for it can no longer be shown. | اس جماعت تک آپ کی رسائی ختم ہو گئی ہے۔ اس کے تجزیات اب نہیں دکھائے جا سکتے۔ | Is jamaat tak aap ki rasai khatam ho gayi hai. Iske tajziyaat ab nahin dikhaye ja sakte. |
| `provisional` | Provisional | عارضی | Aarzi |
| `provisionalBody` | Provisional · Last synced {time} · {count} changes waiting to sync | عارضی · آخری مطابقت {time} · {count} تبدیلیاں مطابقت کی منتظر | Aarzi · Aakhri sync {time} · {count} tabdeeliyan sync ki muntazir |
| `neverSynced` | Never synced | کبھی مطابقت نہیں ہوئی | Kabhi sync nahin hua |
| `serverMissing` | Server figures do not include {count} changes on this device yet. | سرور کے اعداد و شمار میں آلے کی {count} تبدیلیاں ابھی شامل نہیں۔ | Server ke adaad-o-shumaar mein device ki {count} tabdeeliyan abhi shamil nahin. |
| `progress.title` | Progress | پیش رفت | Pesh raft |
| `progress.line` | {unit}: {completed} of {assigned} | {unit}: {assigned} میں سے {completed} | {unit}: {assigned} mein se {completed} |
| `mistakes.title` | Mistakes | غلطیاں | Ghaltiyan |
| `mistakes.byCategory` | By category | قسم کے لحاظ سے | Qism ke lehaaz se |
| `mistakes.bySeverity` | By severity | شدت کے لحاظ سے | Shiddat ke lehaaz se |
| `mistakes.repeated` | Repeated (counted separately) | دہرائی گئی (الگ شمار) | Dohrayi gayi (alag shumaar) |
| `notRecorded` | Not recorded | درج نہیں | Darj nahin |
| `quality.title` | Quality | معیار | Meyaar |
| `quality.average` | Average {value} · {label} · from {count} ratings | اوسط {value} · {label} · {count} درجہ بندیوں سے | Ausat {value} · {label} · {count} rating se |
| `quality.improving` | Improving: the average fell from {from} to {to} (lower is better) | بہتری: اوسط {from} سے {to} ہو گیا (کم بہتر ہے) | Behtari: ausat {from} se {to} ho gaya (kam behtar hai) |
| `quality.worsening` | Needs more attention: the average rose from {from} to {to} | مزید توجہ درکار: اوسط {from} سے {to} ہو گیا | Mazeed tawajjoh darkaar: ausat {from} se {to} ho gaya |
| `quality.steady` | No clear change | کوئی واضح تبدیلی نہیں | Koi wazeh tabdeeli nahin |
| `quality.axisTop` | 1 · Excellent | ۱ · ممتاز | 1 · Mumtaz |
| `quality.axisBottom` | 5 · Weak | ۵ · کمزور | 5 · Kamzor |
| `quality.showValues` | Show values | قدریں دکھائیں | Qadrein dikhayein |
| `quality.hideValues` | Hide values | قدریں چھپائیں | Qadrein chhupayein |
| `chart.summary` | Quality, {from} to {to}: average {avg} ({label}), from {count} ratings. Best {min}, weakest {max}. {gaps} days not rated. | معیار، {from} سے {to}: اوسط {avg} ({label})، {count} درجہ بندیوں سے۔ بہترین {min}، کمزور ترین {max}۔ {gaps} دن درجہ بندی نہیں۔ | Meyaar, {from} se {to}: ausat {avg} ({label}), {count} rating se. Behtareen {min}, kamzor tareen {max}. {gaps} din rating nahin. |
| `chart.point` | {date}: {score} · {label} | {date}: {score} · {label} | {date}: {score} · {label} |
| `difficult.title` | Recurring difficult portions | بار بار مشکل حصے | Baar baar mushkil hisse |
| `difficult.none` | None found in this period | اس مدت میں کوئی نہیں ملا | Is muddat mein koi nahin mila |
| `difficult.item` | {portion}: flagged {count} times | {portion}: {count} بار نشان زد | {portion}: {count} baar nishaan zad |
| `attendance.title` | Attendance (separate from recitation) | حاضری (تلاوت سے الگ) | Haazri (tilawat se alag) |
| `homework.title` | Homework completion | ہوم ورک کی تکمیل | Homework ki takmeel |
| `homework.carried` | Carried over | آگے بڑھایا گیا | Aage barhaya gaya |
| `ai.label` | AI suggestion — review required | اے آئی کی تجویز — جائزہ ضروری ہے | AI ki tajweez — jaiza zaroori hai |
| `ai.get` | Get AI recommendations | اے آئی کی سفارشات حاصل کریں | AI ki sifarishaat hasil karein |
| `ai.again` | Get again | دوبارہ حاصل کریں | Dobara hasil karein |
| `ai.range` | Period: {from} to {to} | مدت: {from} سے {to} | Muddat: {from} se {to} |
| `ai.metricsUsed` | Metrics used | استعمال شدہ پیمانے | Istemaal shuda paimane |
| `ai.observations` | Observations | مشاہدات | Mushahidaat |
| `ai.suggestions` | Suggestions | تجاویز | Tajaweez |
| `ai.disclaimer` | This is an AI suggestion based on the records above. It is not a religious, medical or psychological judgment, and it is not guaranteed. Use your own judgment. | یہ اوپر کے ریکارڈ پر مبنی اے آئی کی تجویز ہے۔ یہ دینی، طبی یا نفسیاتی فیصلہ نہیں اور اس کی کوئی ضمانت نہیں۔ اپنی رائے سے کام لیں۔ | Yeh upar ke record par mabni AI ki tajweez hai. Yeh deeni, tibbi ya nafsiyati faisla nahin aur iski koi zamanat nahin. Apni raaye se kaam lein. |
| `ai.offline` | AI needs a connection | اے آئی کو انٹرنیٹ چاہیے | AI ko internet chahiye |
| `ai.loading` | Getting AI recommendations… | اے آئی کی سفارشات حاصل کی جا رہی ہیں… | AI ki sifarishaat hasil ki ja rahi hain… |
| `ai.slow` | This is taking longer than usual… | معمول سے زیادہ وقت لگ رہا ہے… | Mamool se ziyada waqt lag raha hai… |
| `ai.notSetup` | AI provider not set up | اے آئی فراہم کنندہ ترتیب نہیں دیا گیا | AI faraham karne wala set up nahin kiya gaya |
| `ai.openSettings` | Open AI settings | اے آئی کی ترتیبات کھولیں | AI ki tarteebaat kholein |
| `ai.unavailable` | AI unavailable | اے آئی دستیاب نہیں | AI dastiyab nahin |
| `ai.tryLater` | AI unavailable — try again later | اے آئی دستیاب نہیں — بعد میں دوبارہ کوشش کریں | AI dastiyab nahin — baad mein dobara koshish karein |
| `ai.retry` | Try again | دوبارہ کوشش کریں | Dobara koshish karein |
| `ai.limit` | AI limit reached for this period | اس مدت کے لیے اے آئی کی حد پوری ہو گئی | Is muddat ke liye AI ki hadd poori ho gayi |
| `ai.insufficient` | Not enough data for AI suggestions | اے آئی کی تجاویز کے لیے کافی ڈیٹا نہیں | AI ki tajaweez ke liye kafi data nahin |

### `aiSettings.*`
| Key | English | Urdu | Roman Urdu |
|---|---|---|---|
| `title` | AI settings | اے آئی کی ترتیبات | AI ki tarteebaat |
| `intro` | AI gives optional suggestions based on calculated figures. It never changes records. | اے آئی حساب شدہ اعداد پر مبنی اختیاری تجاویز دیتا ہے۔ یہ ریکارڈ کبھی تبدیل نہیں کرتا۔ | AI hisaab shuda adaad par mabni ikhtiyari tajaweez deta hai. Yeh record kabhi tabdeel nahin karta. |
| `loading` | Loading AI settings… | اے آئی کی ترتیبات لوڈ ہو رہی ہیں… | AI ki tarteebaat load ho rahi hain… |
| `enabled` | Turn on AI | اے آئی آن کریں | AI on karein |
| `provider` | AI provider | اے آئی فراہم کنندہ | AI faraham karne wala |
| `noProvider` | No AI provider is available yet | ابھی کوئی اے آئی فراہم کنندہ دستیاب نہیں | Abhi koi AI faraham karne wala dastiyab nahin |
| `noProviderHelp` | Your madrasa can turn AI on once a provider is added. | فراہم کنندہ شامل ہونے کے بعد مدرسہ اے آئی آن کر سکتا ہے۔ | Faraham karne wala shamil hone ke baad madrasa AI on kar sakta hai. |
| `limits` | Limits | حدود | Hudood |
| `limitMonthly` | Requests per month for the madrasa (optional) | مدرسے کی ماہانہ درخواستیں (اختیاری) | Madrase ki mahana darkhwastein (ikhtiyari) |
| `limitTeacherDaily` | Requests per Teacher per day | فی استاد روزانہ درخواستیں | Fi ustaad rozana darkhwastein |
| `budget` | Monthly budget (USD) | ماہانہ بجٹ (امریکی ڈالر) | Mahana budget (USD) |
| `budgetHelp` | Maximum USD 10. You can lower it, not raise it. | زیادہ سے زیادہ 10 امریکی ڈالر۔ آپ اسے کم کر سکتے ہیں، بڑھا نہیں سکتے۔ | Ziyada se ziyada 10 USD. Aap ise kam kar sakte hain, barha nahin sakte. |
| `sharing` | What AI can use | اے آئی کیا استعمال کر سکتا ہے | AI kya istemaal kar sakta hai |
| `category.attendance` | Attendance summary | حاضری کا خلاصہ | Haazri ka khulasa |
| `category.progress` | Sabaq, Sabqi and Manzil progress | سبق، سبقی اور منزل کی پیش رفت | Sabaq, Sabqi aur Manzil ki pesh raft |
| `category.mistakes` | Mistake categories | غلطیوں کی اقسام | Ghaltiyon ki aqsaam |
| `category.quality` | Quality scores | معیار کے اسکور | Meyaar ke score |
| `category.homework` | Homework completion | ہوم ورک کی تکمیل | Homework ki takmeel |
| `neverShared` | Never shared: names, contact details, notes | کبھی شیئر نہیں ہوتے: نام، رابطے کی تفصیل، نوٹس | Kabhi share nahin hote: naam, rabte ki tafseel, notes |
| `usage` | This month: {used} of {cap} requests · USD {spent} of {budget} | اس ماہ: {cap} میں سے {used} درخواستیں · {budget} میں سے {spent} امریکی ڈالر | Is mah: {cap} mein se {used} darkhwastein · {budget} mein se {spent} USD |
| `usageNoCap` | This month: {used} requests · USD {spent} of {budget} | اس ماہ: {used} درخواستیں · {budget} میں سے {spent} امریکی ڈالر | Is mah: {used} darkhwastein · {budget} mein se {spent} USD |
| `save` | Save AI settings | اے آئی کی ترتیبات محفوظ کریں | AI ki tarteebaat mahfooz karein |
| `saved` | AI settings saved. | اے آئی کی ترتیبات محفوظ ہو گئیں۔ | AI ki tarteebaat mahfooz ho gayin. |
| `error.positive` | Limits must be positive numbers | حدود مثبت اعداد ہونی چاہئیں | Hudood musbat adaad honi chahiye |
| `error.budget` | The budget can only be lowered, up to USD 10 | بجٹ صرف کم کیا جا سکتا ہے، زیادہ سے زیادہ 10 امریکی ڈالر | Budget sirf kam kiya ja sakta hai, ziyada se ziyada 10 USD |
| `error.stale` | These settings changed elsewhere. Reload and try again. | یہ ترتیبات کہیں اور تبدیل ہو گئیں۔ دوبارہ لوڈ کر کے کوشش کریں۔ | Yeh tarteebaat kahin aur tabdeel ho gayin. Dobara load karke koshish karein. |
| `offline` | AI settings need a connection. Connect to the internet to view or change them. | اے آئی کی ترتیبات کے لیے انٹرنیٹ درکار ہے۔ دیکھنے یا تبدیل کرنے کے لیے انٹرنیٹ سے جڑیں۔ | AI ki tarteebaat ke liye internet darkaar hai. Dekhne ya tabdeel karne ke liye internet se judein. |
| `revoked` | Your access to AI settings was removed. | اے آئی کی ترتیبات تک آپ کی رسائی ختم ہو گئی ہے۔ | AI ki tarteebaat tak aap ki rasai khatam ho gayi hai. |
| `readOnly` | Only the madrasa Owner or Admin can change AI settings. | صرف مدرسے کا مالک یا ایڈمن اے آئی کی ترتیبات تبدیل کر سکتا ہے۔ | Sirf madrase ka Owner ya Admin AI ki tarteebaat tabdeel kar sakta hai. |

Note for the translator/reviewer: Urdu and Roman Urdu copy above is a working draft by the UI/UX agent and needs a native-speaker review before release, like the other locales.

## Frontend checklist
- [ ] Routes `Analytics`, `AiSettings` registered in `RootNavigator`; entries gated by role (staff/roster), not shown to Student/Parent.
- [ ] All states above reachable in component tests; AI states keep metrics on screen.
- [ ] No AI text when offline or off; AI area never shows cached output across periods.
- [ ] Quality axis 1 top / 5 bottom; null = gap; "improving" wording from domain result, no inline maths.
- [ ] Budget conversion to integer micro-USD; max 10; lowering only.
- [ ] All keys in `en`, `ur`, `ur-Latn`; RTL chart direction and `isolate()` on ranges verified.
