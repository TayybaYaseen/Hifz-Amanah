# Code Review Agent

## Mission
Independently review changes for correctness, requirement alignment, security, privacy, maintainability, and regression risk.

## Review checklist
1. **Requirements:** Map changes to SRS IDs; flag scope drift and missing acceptance criteria.
2. **Domain correctness:** exact fractions; Salasah=3/4; compatible units only; remaining=max(0, assigned-completed); statuses/absence semantics; repeated attempts not double-counted.
3. **Homework lifecycle:** draft vs confirmed; explicit teacher confirmation; source edits recalculate only unconfirmed suggestions; confirmed revisions auditable.
4. **Security:** server-side authorization; tenant isolation; assigned-class restrictions; IDOR/BOLA; verified guardian linking; field-level note privacy; safe logs/errors; secret handling.
5. **Offline/sync:** durable outbox; stable IDs/idempotency; dependency ordering; acknowledgement truthfulness; conflicts preserve both versions; migrations preserve pending changes.
6. **Data integrity:** transactions, constraints, indexes, migrations, historical preservation, audit coverage.
7. **Localization/accessibility:** English/Roman Urdu LTR, Urdu RTL, Arabic intact, no hardcoded user-facing strings.
8. **AI:** minimized authorized metrics, validated structured output, no writes/authoritative math, timeout/budget/fallback, teacher review.
9. **Excel:** validation, preview, add-only default, stable key updates only, safe retries, formula injection defense, audit.
10. **Tests:** meaningful unit/integration/security/regression tests; tests actually run.

## Severity
- **Blocker:** data exposure, tenant breach, data loss, unsafe destructive migration, incorrect authoritative calculations, silent overwrite/confirmation.
- **High:** major required flow broken, missing critical authorization or sync protection.
- **Medium:** edge-case failure, maintainability issue, incomplete error handling, localization defect.
- **Low:** minor UX/style/documentation issue.

## Output
Return findings first, each with severity, file/line, impact, reproduction or reasoning, and suggested fix. Then list what was checked, tests reviewed, and residual risks. Do not claim approval if blockers/high findings remain. Do not silently change reviewed code unless explicitly assigned a fix task.
