# Enforce Workflow-Scoped Draft Suggestions And Reset

This ExecPlan is a living document. Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current as work proceeds. This plan follows `.agent/PLANS.md`.

## Purpose / Big Picture

Make ASHURA behave like a strict workflow: registered keywords are the input, fetched program-table rows are the source data, demand/competition research records the inspected situation, and article draft suggestions are created only from that researched program-table context. Add a red `データリセット` control at the bottom of the sidebar so stale generated data can be cleared without removing registered keywords.

## Progress

- [x] (2026-06-08 JST) Confirmed stale article suggestions are read directly from persisted `Recommendation` rows.
- [x] (2026-06-08 JST) Confirmed recommendation generation still mixed program hits with old task and Yahoo-news suggestions.
- [x] (2026-06-08 JST) Decided reset should delete generated workflow data while preserving `WatchKeyword` registered keywords and app settings.
- [x] (2026-06-08 JST) Implemented reset API and sidebar reset button.
- [x] (2026-06-08 JST) Restricted recommendation generation to researched program-table hits and removed task/news sources.
- [x] (2026-06-08 JST) Validated locally with Prisma validate, type-check, lint, diff check, and production build.
- [x] (2026-06-08 JST) Pushed with savepoint, deployed to Render, and verified production HTTP/HTML responses.
- [x] (2026-06-08 JST) Changed article suggestion generation from replace-top-20 to append-next-20.
- [x] (2026-06-08 JST) Confirmed demand/competition research rows disappeared from the UI after route navigation even though the data was persisted.
- [x] (2026-06-08 JST) Added a saved-result restoration path for the demand/competition page.
- [x] (2026-06-08 JST) Local validation passed for the saved-result restoration fix.
- [x] (2026-06-08 JST) Pushed with savepoint, deployed, and verified the restoration fix in production.
- [x] (2026-06-08 JST) Investigated why repeated article draft generation changed the visible first recommendations.
- [x] (2026-06-08 JST) Stabilized recommendation ordering and future dedupe keys for same program/time inputs.
- [x] (2026-06-08 JST) Local validation passed for the recommendation stability fix.
- [x] (2026-06-08 JST) Pushed with savepoints, deployed, and verified the recommendation stability and priority fixes.
- [x] (2026-06-08 JST) Confirmed `AUTH_SECRET` is only needed for the old login/session-signing code.
- [x] (2026-06-08 JST) Removed login/session signing dependency so the app can run without `AUTH_SECRET`.
- [x] (2026-06-08 JST) Local validation passed after removing login/session signing and forcing data-backed layouts dynamic.
- [x] (2026-06-08 JST) Pushed with savepoint, deployed, removed live Render `AUTH_SECRET`, redeployed without it, and verified production.
- [x] (2026-06-08 JST) Reproduced in the existing Chrome/CDP session that estimated-only demand rows still generated priority 63 article suggestions.
- [x] (2026-06-08 JST) Updated article suggestion generation to require a persisted measured `Serp.resultCount`.
- [x] (2026-06-08 JST) Found that reset deleted database rows but left stale recommendation client state visible on the current page.
- [x] (2026-06-08 JST) Changed reset success handling to reload the current page so visible data matches the reset database state.
- [x] (2026-06-08 JST) Found that estimated demand rows were cached for 12 hours and not retried by live research.
- [x] (2026-06-08 JST) Added UTF-8 safe Google/Yahoo result-count parsing and made estimated/missing competition rows retry live measurement.

## Surprises & Discoveries

The demand/competition page persists research into `Keyword` and `Serp`, but the recommendation engine did not require those records before generating article suggestions. This allowed suggestions to appear from past database state or non-EPG sources.

The demand/competition page also held the visible ranking table only in client-side React state. Navigating to article drafts and back cleared the table even though the `Keyword` and `Serp` records still existed in the database.

Repeated article suggestion generation appended the next 20 unseen candidates, while the visible list sorted same-priority rows by newest `createdAt` first. This let newly added same-score rows move above older rows. Candidate discovery also relied on implicit database order in a few places, and the future dedupe key used `Program.id`, which can change after the same program table is re-ingested.

Production data showed existing recommendations with stored priority `50` even though their evidence `research.opportunityScore` was `1`. The recommendation engine had clamped all article-suggestion priorities to a minimum of 50, which made weak candidates look like medium-priority items.

The app no longer has a visible login flow, but `src/lib/auth.ts` still carried session-cookie signing with `AUTH_SECRET`. Since ASHURA is now a single-user, buyer-operated tool, that secret can be removed if auth resolves to the internal local ASHURA user.

Removing cookie-based auth made some dashboard pages eligible for static generation during `next build`. Those pages read and seed runtime data, so the dashboard and EPG layouts must explicitly stay dynamic to avoid baking build-time database state into deployed HTML.

Manual production browser testing after reset showed demand/competition research could return 194 ranking rows where every visible top row was `needs measurement` / estimated competition. Article draft generation still used the persisted `Keyword.priority` from those estimated rows and created priority 63 suggestions with `resultCount` missing. The mismatch was not only ordering; the recommendation engine treated estimated research as completed research.

The reset API can delete recommendation rows successfully while `RecommendationsClient` still displays its pre-reset `useState` list. A full page reload after reset is needed because `router.refresh()` does not reset that local state in this client component.

The natural SERP parser still looked for mojibake text for the Japanese result-count marker instead of the real `件` marker. Production also reused estimated cached rows, so a failed measurement could remain `needs measurement` without another Google/Yahoo attempt for 12 hours.

## Decision Log

- Decision: Keep registered keywords during reset.
  Reason: They are the user's workflow input, not generated result data.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Remove task and Yahoo-news recommendation sources from article draft suggestion generation.
  Reason: The requested product flow is program table -> demand/competition research -> article draft suggestions.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Gate article suggestions on saved demand/competition research records.
  Reason: Suggestions should not appear until the user has run the research step for the fetched program-table hits.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Preserve existing article suggestions and create the next 20 unseen suggestions per button click.
  Reason: The user expects `記事ネタ提案を作成` to add more suggestions over time instead of replacing or capping the list at 20.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Restore demand/competition rows with a `cacheOnly` API mode instead of re-running live research on page load.
  Reason: Returning to the page should show saved results without consuming external SERP quota or mutating the workflow state.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Make article suggestion order stable by preserving older same-priority rows ahead of newly appended rows.
  Reason: Repeated same-day generation should not make the visible first items churn when scores and dates are tied.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Stop using mutable `Program.id` as the future article-suggestion dedupe identity.
  Reason: Re-ingesting the same program table can recreate program rows with new ids, so the same program should instead dedupe by registered keyword, research term, date/time, title, and channel.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Use evidence-backed opportunity score as the display priority for recommendations.
  Reason: Existing rows may have an inflated stored priority from the old minimum-50 clamp; the UI and API should show the actual demand/competition score when it is available.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Remove login/session signing and keep the internal local ASHURA user.
  Reason: Buyers do not need to log in, and this removes `AUTH_SECRET` as a required Render environment variable while preserving the existing single-site ownership records.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Force dashboard and EPG layouts to remain dynamic after removing cookie auth.
  Reason: Without cookie reads, Next.js may statically generate data-backed pages from the build-time SQLite database.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Treat article suggestions as eligible only when a latest persisted `Serp` row exists with a non-null `resultCount`.
  Reason: A `Keyword` row alone can come from estimated demand research. If the demand screen says competition needs measurement, article drafts must not turn that internal estimate into a visible priority score.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Reload the current page after reset succeeds.
  Reason: Reset is a global workflow operation, and page-local React state such as the recommendations list must be discarded immediately after the database is cleared.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Retry cached rows unless they have measured competition data from Google, Yahoo, SerpAPI, or a measured cache record.
  Reason: Estimated rows are not completed demand/competition research and must not block fresh natural SERP measurement.
  Date / Recorder: 2026-06-08 / Codex

- Decision: Parse Google/Yahoo result counts using Unicode-safe `件` / `results` patterns and Yahoo `pager.hits`.
  Reason: Buyers should get natural-search competition counts without requiring SerpAPI when Google or Yahoo exposes the count in the search result page.
  Date / Recorder: 2026-06-08 / Codex

## Outcomes & Retrospective

Implemented the strict workflow gate and reset control. Local validation passed:

    DATABASE_URL=file:./data/ashura-validation.db npx prisma validate
    npx tsc --noEmit --pretty false
    git diff --check
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build

Pushed commit `7233f93` with savepoint `savepoints/main-20260608-141825`. Render deploy `dep-d8j51942m8qs739b1chg` is live. Production HTTP checks passed for the core workflow pages. `GET /api/workflow/reset` returns 405 as expected because reset is DELETE-only, and the dashboard HTML contains `データリセット` plus the new workflow copy.

Follow-up validation for append-next-20 passed:

    npx tsc --noEmit --pretty false
    git diff --check
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build

Follow-up restoration fix local validation passed:

    DATABASE_URL=file:./data/ashura-validation.db npx prisma validate
    npx tsc --noEmit --pretty false
    git diff --check
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build

Expected behavior: after demand/competition research is complete, navigating to article drafts and returning to demand/competition reloads saved `Keyword`/`Serp` results into the ranking table.

Production verification for the restoration fix passed:

    Commit: 75a638f Restore saved demand research results
    Savepoint: savepoints/main-20260608-180354
    Render deploy: dep-d8j8b042m8qs739clgk0 live
    HTTP 200: /dashboard/keywords/discovery, /dashboard/recommendations, /dashboard/channel, /api/recommendations
    POST /api/v1/keywords/opportunity-check with cacheOnly=true returned 200, ok=true, cacheOnly=true, itemCount=0 for a probe term.

Follow-up recommendation stability fix is in progress. Expected behavior: clicking article suggestion generation repeatedly appends new unseen candidates, but existing same-priority top rows stay stable instead of being displaced by newer same-score rows.

Follow-up recommendation stability local validation passed:

    DATABASE_URL=file:./data/ashura-validation.db npx prisma validate
    npx tsc --noEmit --pretty false
    git diff --check
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build

Production verification for the recommendation stability and priority fixes passed:

    Commit: fc54ea7 Stabilize recommendation ordering
    Savepoint: savepoints/main-20260608-182432
    Render deploy: dep-d8j8kl9o3t8c73bqodrg live
    Commit: 63a9af9 Use evidence scores for recommendation priority
    Savepoint: savepoints/main-20260608-183008
    Render deploy: dep-d8j8nak8aovs73adjc90 live
    HTTP 200: /dashboard/recommendations, /api/recommendations, /dashboard/keywords/discovery, /dashboard/channel
    /api/recommendations now returns existing low-score rows as priority 1 instead of the old inflated priority 50.

Follow-up auth-secret removal is in progress. Expected behavior: production runs with `DATABASE_URL`, `GEMINI_API_KEY`, optional `SERPAPI_KEY`, `GEMINI_MODEL`, and `NODE_ENV`, but no `AUTH_SECRET`.

Follow-up auth-secret removal local validation passed:

    rg AUTH_SECRET/login/session/bcrypt/jose scan: no hits in src, package.json, render.yaml, README.md, docs, AGENTS.md, prisma
    DATABASE_URL=file:./data/ashura-validation.db npx prisma validate
    npx tsc --noEmit --pretty false
    git diff --check
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build

Production verification for auth-secret removal passed:

    Commit: 39ad18f Remove login session secret requirement
    Savepoint: savepoints/main-20260608-185039
    Render deploy: dep-d8j90tv41pts739pkl6g live
    Deleted live Render env var: AUTH_SECRET
    Manual redeploy without AUTH_SECRET: dep-d8j92acvikkc73bd5f7g live
    Remaining live env keys: DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL, NODE_ENV
    HTTP 200: /dashboard/channel, /dashboard/watchwords, /dashboard/recommendations, /api/recommendations, /api/v1/settings/api-readiness

## Context and Orientation

Important files:

- `src/lib/recommendations/engine.ts`: creates persisted article suggestions.
- `src/app/api/v1/keywords/opportunity-check/route.ts`: persists demand/competition research into `Keyword` and `Serp`.
- `src/lib/epg/ingest.ts`: finds registered-keyword hits inside saved program-table rows.
- `src/components/AppShell.tsx`: sidebar layout where the reset button should live.
- `prisma/schema.prisma`: generated workflow data models.

`WatchKeyword` is the registered-keyword table and must remain after reset. `Program`, `EpgHtml`, `Keyword`, `Serp`, `Signal`, `Opportunity`, `Recommendation`, old `Task` records, and related generated rows are resettable workflow output.

## Plan of Work

First, add a small pure helper that builds the same research query terms from `ProgramHit` on both client and server. Next, update the recommendation engine so it uses the latest fetched EPG range, filters hits to those with matching persisted research, clears old recommendations before inserting the new set, and removes old task/news sources. Then add a reset API and a client sidebar reset button. Finally, run validation, push with a savepoint, deploy, and smoke-check production HTTP endpoints.

## Concrete Steps

Run from the repository root:

    git status --short
    npx tsc --noEmit --pretty false
    npm run lint
    DATABASE_URL=file:./data/ashura-validation.db npm run build
    git diff --check

Before pushing to `main`, create the required savepoint branch from `origin/main`, then push `main`.

## Validation and Acceptance

The change is accepted when:

- Article suggestions are empty after reset.
- Resetting from the article draft page removes stale visible suggestions without requiring manual navigation.
- Registered keywords remain after reset.
- Running demand/competition research persists research data.
- Running demand/competition research retries estimated/missing rows instead of treating them as completed cache.
- Google/Yahoo natural search result pages can provide measured competition counts without SerpAPI when accessible.
- Returning to the demand/competition page after navigating away shows saved research rows without running fresh live research.
- Running article suggestion generation only creates suggestions for program hits that have matching persisted measured research with a stored SERP result count.
- Repeated article suggestion generation uses deterministic candidate discovery and stable ordering for tied recommendation scores.
- The app does not require `AUTH_SECRET` or login/session cookies in buyer deployments.
- Production routes for the core flow return non-502 responses after deploy.

## Idempotence and Recovery

The reset endpoint must be safe to run repeatedly. It deletes generated rows by site where applicable, then global EPG rows, while preserving registered keywords and settings. If deployment fails, inspect Render logs and fix the specific failing build/start condition before retrying.

## Artifacts and Notes

Do not print or store secret environment variable values in this plan.

## Interfaces and Dependencies

New or changed interfaces:

- `DELETE /api/workflow/reset`: deletes generated workflow data and returns deletion counts.
- Sidebar `データリセット` button: calls the reset endpoint after confirmation.
- `generateRecommendationsForSite`: returns suggestions only from researched EPG hits with measured SERP result counts.
