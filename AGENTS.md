# AGENTS

This file is the agent-facing README for the ASHURA repository.

## Repository Quickstart

- Install dependencies: `npm install`
- Generate Prisma client: `npm run prisma:generate`
- Run the development server: `npm run dev`
- Build the app: `npm run build`
- Start a production build locally: `npm run start`
- Lint: `npm run lint`
- Type-check: `npx tsc --noEmit --pretty false`
- Required runtime environment: Node.js, Next.js, Prisma, and a supported `DATABASE_URL`.
- Optional paid API environment variables:
  - `GEMINI_API_KEY`
  - `SERPAPI_KEY`
- Do not commit `.env` files or provider API keys.

## Code Style & Conventions

- Use TypeScript and the existing Next.js App Router structure.
- Keep UI changes consistent with the existing component and CSS patterns.
- Prefer small, focused changes over broad refactors.
- Keep generated files, screenshots, logs, and local validation output outside Git.

## Safety / Quality Guardrails

- Run relevant validation before finishing work.
- Do not add production dependencies without explicit approval.
- Do not print, commit, or store raw secrets, tokens, login credentials, customer data, or personal data.
- Do not edit `.env`, credential, token, password, or config-secret files without explaining the purpose and getting explicit approval.
- Do not read or write personal cloud folders or machine-specific private folders outside this repository.
- Keep distribution artifacts free of local browser logs, screenshots, private session data, and operational transcripts.

## ExecPlans

- An `ExecPlan` is required for non-trivial work such as multi-file changes, feature work, large refactors, security cleanup, data migration, or ambiguous tasks.
- The ExecPlan format is defined in `.agent/PLANS.md`.
- The default active plan path is `EXEC_PLAN.md`.
- Keep `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` current while implementing.
- Make reasonable assumptions when needed, record them in `Decision Log`, and continue toward a verifiable result.
