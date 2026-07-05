# ASHURA Phase1 Figma Components

## Scope
- Phase1 priority is `command-center` and `opportunities`.
- This document defines the base component contract for 7 screens.
- Data source alignment targets:
  - OpenAPI: `openapi/ashura-v1.yaml`
  - Prisma: `prisma/schema.prisma`

## Shared Tokens
- Layout: `AppShell` + main content column.
- Cards: summary KPIs, status pills, empty-state blocks.
- Table: sortable headers, sticky first column for desktop.
- CTA types:
  - Primary: create/apply/save action.
  - Secondary: filter/refresh.
  - Destructive: close/resolve/archive.

## 1) /dashboard/command-center
- Information hierarchy:
  - Global KPI cards: open opportunities, pending outcomes, critical alerts.
  - Trend strips: EPG hit and task progress mini trend.
  - Priority queue list: top opportunities by score.
- Main states:
  - `loading`: skeleton cards.
  - `empty`: no opportunities with onboarding CTA.
  - `error`: fetch error alert.
- Primary CTA:
  - `View Opportunities`
  - `Update Scoring`
- OpenAPI mapping:
  - `GET /dashboard/command-center`
- Prisma mapping:
  - `Opportunity`, `TaskOutcome`, `Alert`, `ScoringConfig`

## 2) /dashboard/opportunities/[id]
- Information hierarchy:
  - Header: title, score, status, tags.
  - Evidence timeline.
  - Related task outcomes and alerts.
- Main states:
  - `open`, `in_review`, `done`, `archived`
  - empty evidence
  - blocked by alert
- Primary CTA:
  - `Create Task`
  - `Mark In Review`
  - `Archive`
- OpenAPI mapping:
  - `GET /opportunities/{opportunityId}`
  - `POST /opportunities/{opportunityId}/tasks`
- Prisma mapping:
  - `Opportunity`, `OpportunityEvidence`, `TaskOutcome`, `Alert`

## 3) /dashboard/tasks/[taskId]
- Information hierarchy:
  - Task outcome header (status, score delta).
  - Execution notes.
  - Related alerts and linked opportunity.
- Main states:
  - pending/running/blocked/done
  - no linked opportunity
- Primary CTA:
  - `Update Status`
  - `Add Outcome Note`
- OpenAPI mapping:
  - `PATCH /tasks/{taskId}`
- Prisma mapping:
  - `TaskOutcome`, `Task`, `Alert`

## 4) /dashboard/content/health
- Information hierarchy:
  - Content quality KPI cards.
  - Degradation list by page/keyword.
  - Suggested opportunities panel.
- Main states:
  - healthy/warning/critical
  - no issue state
- Primary CTA:
  - `Create Opportunity`
  - `Refresh Health Data`
- OpenAPI mapping:
  - (Phase1 optional extension through command-center summary stream)
- Prisma mapping:
  - `KeywordSnapshot`, `Opportunity`

## 5) /dashboard/insights/seo
- Information hierarchy:
  - Keyword snapshot trend table.
  - Outlier keywords and movement badges.
- Main states:
  - data present
  - no snapshots
- Primary CTA:
  - `Sync Snapshot`
  - `Create Opportunity from Keyword`
- OpenAPI mapping:
  - `GET /insights/seo`
- Prisma mapping:
  - `KeywordSnapshot`, `Opportunity`

## 6) /dashboard/channel
- Information hierarchy:
  - Active site and readiness checks.
  - Watchword controls.
  - EPG hit candidates and generated article plans.
- Main states:
  - no watchwords
  - candidates available
  - AI planning in progress
- Primary CTA:
  - `Collect EPG`
  - `Generate plans`
- OpenAPI mapping:
  - `GET /channel/*`
- Prisma mapping:
  - `WatchKeyword`, `Program`, `ProgramHit`, `Recommendation`

## 7) /dashboard/settings/scoring
- Information hierarchy:
  - Weight sliders/inputs.
  - Preset templates.
  - Version history.
- Main states:
  - active config
  - unsaved edits
  - validation error
- Primary CTA:
  - `Save Scoring Config`
  - `Activate Version`
- OpenAPI mapping:
  - `PATCH /settings/scoring`
- Prisma mapping:
  - `ScoringConfig`

## Phase1 Coverage Note
- Must-have: `command-center` + `opportunities`.
- Other screens are baseline wireframes with data contracts fixed for next cycle.
