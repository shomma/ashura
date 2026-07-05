# Make ASHURA Build And Run Locally

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. This plan follows `.agent/PLANS.md`.

## Purpose / Big Picture

Make this Next.js + Prisma SQLite repository build and start locally without requiring a pre-existing machine-specific database path. Success means a fresh checkout can generate the Prisma client, create the local SQLite schema, pass type/lint checks, complete `npm run build` without Prisma "Unable to open the database file" errors, and run with `npm run dev` or `npm run start`.

## Progress

- [x] (2026-07-05 04:12Z) Inspected package scripts, Prisma schema, database helper, dashboard layouts, and existing uncommitted changes.
- [x] (2026-07-05 04:15Z) Reproduced that `npm run sqlite:init` fails without `DATABASE_URL`, while current build no longer reproduces Prisma error 14 because build-phase fallbacks avoid DB writes.
- [x] (2026-07-05 04:20Z) Found a separate local build blocker: `next/font/google` requires fetching Inter from Google Fonts during `next build`.
- [x] (2026-07-05 04:22Z) Implemented a minimal, local-safe database URL and build behavior fix without overwriting unrelated user changes.
- [x] (2026-07-05 04:22Z) Updated local setup documentation and scripts.
- [ ] Validate with Prisma, TypeScript, lint, and production build.

## Surprises & Discoveries

Two files already had uncommitted local changes before this task started: `/home/shomma/meruru/ASHURA/src/lib/auth.ts` and `/home/shomma/meruru/ASHURA/src/lib/single-site.ts`. Those changes add build-phase fallbacks and must be preserved unless directly superseded.

`/home/shomma/meruru/ASHURA/src/lib/prisma.ts` already tries to default SQLite to `file:./data/ashura.db` locally and `file:/var/data/ashura.db` in production, but that relative URL is interpreted by Prisma relative to the Prisma schema directory, not necessarily the project root. This can make file and directory creation assumptions fragile.

`npm run build` later failed on `src/app/layout.tsx` because `next/font/google` attempted to fetch Inter from `fonts.googleapis.com`. In a restricted or offline local environment this is another hard build blocker unrelated to Prisma.

## Decision Log

- Decision: Treat this as a local developer experience fix, not a feature refactor.
  Reason: The user needs the repository to build and run locally; broad UI or workflow changes would increase risk.
  Date / Recorder: 2026-07-05 / Codex

- Decision: Preserve existing uncommitted edits in `auth.ts` and `single-site.ts`.
  Reason: They were present before this task and may be the user's work.
  Date / Recorder: 2026-07-05 / Codex

- Decision: Add a local `.env` only after explicit user approval.
  Reason: `.env` is ignored and useful for local Prisma CLI defaults, but it is a secret/config file and should not be edited without permission.
  Date / Recorder: 2026-07-05 / Codex

- Decision: Remove `next/font/google` usage and rely on the existing CSS font stack.
  Reason: Local builds should not require network access to Google Fonts; `globals.css` already defines an app-wide font stack.
  Date / Recorder: 2026-07-05 / Codex

## Outcomes & Retrospective

Pending.

## Context and Orientation

This repository is a Next.js App Router app at `/home/shomma/meruru/ASHURA`. Prisma uses SQLite via `/home/shomma/meruru/ASHURA/prisma/schema.prisma`, with `DATABASE_URL` as the datasource. `src/lib/prisma.ts` is the central PrismaClient factory and also mutates `process.env.DATABASE_URL` to a default path when no environment variable is present.

Next.js can prerender App Router pages during `next build`. Pages or layouts that call Prisma while being prerendered need either a valid build-time database or explicit dynamic rendering. The dashboard and EPG layouts already export `dynamic = 'force-dynamic'`; several pages also call Prisma directly and may still run during build.

Important files:

- `/home/shomma/meruru/ASHURA/src/lib/prisma.ts`: database URL resolution and PrismaClient construction.
- `/home/shomma/meruru/ASHURA/src/lib/auth.ts`: local fallback user creation.
- `/home/shomma/meruru/ASHURA/src/lib/single-site.ts`: local single-site creation and lookup.
- `/home/shomma/meruru/ASHURA/prisma/schema.prisma`: SQLite datasource and schema.
- `/home/shomma/meruru/ASHURA/package.json`: local setup/build scripts.
- `/home/shomma/meruru/ASHURA/README.md`: developer setup instructions.

## Plan of Work

First reproduce the failure with the current environment and capture whether `DATABASE_URL` is set. Then inspect Prisma's effective SQLite path behavior and any pages still reading Prisma at build time. Apply the smallest change that makes the default local database path deterministic and creatable from the repository root, while keeping production Render behavior intact. If the schema is missing, ensure documented local setup includes `npm run sqlite:init` or an equivalent script before `npm run build`. Finally run validation commands with an explicit local SQLite URL and without one to confirm defaults work.

## Concrete Steps

Run from `/home/shomma/meruru/ASHURA`:

    npm run build
    npm run prisma:generate
    npm run db:push
    npx tsc --noEmit --pretty false
    npm run lint
    npm run build

If network or dependency installation is required, request approval before downloading anything.

## Validation and Acceptance

Acceptance criteria:

- `npm run build` completes without Prisma error code 14.
- The default local SQLite database path is stable and writable in the repository workspace.
- `npm run dev` can start using the same local database after `npm run sqlite:init`.
- TypeScript and lint checks pass or any unrelated existing failures are clearly reported.
- Documentation explains the local setup order and required optional environment variables.

## Idempotence and Recovery

Creating the SQLite parent directory and opening the database file are idempotent. `prisma db push` is intended to be rerunnable for the local development database. If a generated local SQLite database becomes invalid, the user can remove ignored files under `data/` or `prisma/data/` and rerun `npm run sqlite:init`; this plan will not delete those files automatically.

## Artifacts and Notes

Initial user-reported symptom:

    npm run build reaches static page generation and logs multiple Prisma errors:
    Error code 14: Unable to open the database file

## Interfaces and Dependencies

No new production dependencies should be added. The public developer interface should remain npm scripts in `package.json`:

- `npm run prisma:generate`
- `npm run db:push`
- `npm run sqlite:init`
- `npm run build`
- `npm run dev`
- `npm run start`
