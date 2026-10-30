# HifzAmanah — Product brief

**Tagline:** A Trusted Companion for Quran Memorization
**Status:** Planning only — not implemented
**Full requirements:** [SRS.md](SRS.md) · **Stories:** [user-stories.md](user-stories.md) · **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md) · **Design:** [design.md](design.md)

## The problem

A Hifz teacher records every day, for every student:
- what was assigned
- what the student actually recited
- the mistakes and how well they recited
- what remains and what to give next

Today this lives in registers. That makes weekly and monthly reports slow, totals easy to get wrong, and parents hard to keep informed.

## The product

HifzAmanah is an Android app for madaris and Hifz teachers. Teachers keep working without internet, and their records sync later. Everything else is calculated from the daily records, never typed in twice:
- reports
- homework suggestions
- analytics

## Who uses it

| Role | What they do |
|---|---|
| Madrasa Admin / Owner | Sets up the madrasa, classes, and students; creates all accounts; approves Leave; configures reports and AI. The platform operator creates each madrasa and its first Owner |
| Teacher | Marks attendance (Present, Late, Half day, Leave, Absent); adds students to assigned classes; records Sabaq, Sabqi, and Manzil; confirms homework; publishes reports for assigned classes |
| Student | Reads their own published reports (online, read-only) |
| Parent | Reads published reports of verified linked children (online, read-only) |

## What must always be true

- Sabaq, Sabqi, and Manzil are separate, and each Para portion is tracked on its own.
- Quantities always carry a unit, use exact fractions, and are never added across units.
- Absence, holidays, and missing data are never counted as failure or zero.
- Homework becomes final only when the teacher confirms it.
- Private teacher notes never reach students or parents.
- English, Urdu (RTL), and Roman Urdu are supported; Quranic Arabic is never altered.
- AI only gives advice. It never changes records, and the app works fully without it.

## MVP features

All 73 user stories have one spec each in [specs/](specs/README.md), grouped into 17 features (F01–F17). Every planning decision is recorded in [SRS §17](SRS.md); two are Deferred (the Android application ID and the AI provider vendor).
