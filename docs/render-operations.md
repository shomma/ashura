# Render operations for ASHURA

## Services

- Web: Next.js app defined by `render.yaml`.
- DB: SQLite on the Render persistent disk through `DATABASE_URL`.

## Required environment variables

### Web

- `DATABASE_URL`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional)
- `SERPAPI_KEY` (optional)

## Deploy steps

1. Deploy the Blueprint from `render.yaml`.
2. Set the Web environment variables.
3. Open `/dashboard/channel` and confirm Gemini and EPG readiness.
4. Fetch a program table and confirm that the retrieved programs are displayed.

## Retry

- From the UI, rerun proposal generation from `/dashboard/recommendations`.
## Notes

- Recommendation creation is deduped by `Recommendation(siteId, dedupeKey)`.
- ASHURA does not create external publishing, site registration, or external metric integration records.
- `render.yaml` uses `prisma db push --accept-data-loss` because this distribution cleanup intentionally removes old local-only history and integration columns.
