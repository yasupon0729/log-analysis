# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` houses Next.js App Router routes; `page.tsx` contains server logging and delegates UI to `page-client.tsx`.
- `src/lib/api/` centralizes API clients (`s3/`, shared `client.ts`, `server-client.ts`) and error handling; import via `@/lib/...`.
- `src/lib/logger/` wraps Pino for server and browser usage; `logs/` captures rotated files during local runs.
- UI primitives live under `src/components/`, while design tokens and Panda CSS helpers sit in `src/styles/` and `styled-system/`.

## Build, Test, and Development Commands
- `npm run dev` — start the Turbopack-powered dev server at `http://localhost:3000`.
- `npm run build` — create a production bundle; run before PRs that change runtime behavior.
- `npm run start` — serve the production build locally.
- `npm run lint` — execute Biome checks for linting and type-aware rules.
- `npm run format` — apply Biome formatting; prefer running after edits.
- `npm run kill` — free port 3000 if a stale dev server lingers.

## Coding Style & Naming Conventions
- TypeScript `strict` is enabled; favor explicit types when inference is unclear.
- Follow Biome’s formatting (2-space indent, trailing commas, single quotes) via `npm run format`.
- React components use PascalCase filenames; hooks/utilities remain in camelCase.
- When logging, pass structured objects: `logger.info("event", { context })`.

## Testing Guidelines
- No automated test suite exists yet; when adding tests, colocate under `src/` and mirror the feature path.
- Prefer Playwright or Jest for UI/API layers; name files `<feature>.test.ts(x)`.
- Until coverage targets are defined, aim to exercise new branches manually via `npm run dev` and representative S3 scenarios.

## Commit & Pull Request Guidelines
- Existing history uses concise Japanese summaries (e.g., "biome の設定をfix"); keep messages short, present-tense, and scoped to one change.
- Reference issues in the body when applicable and note any follow-up tasks.
- Pull requests should describe behavior changes, include manual validation steps (command/output), and attach UI screenshots when styles shift.
- Mention required secrets or env vars (`S3_API_ENDPOINT`, `AWS_REGION`, etc.) if reviewers need them for verification.

## Communication
- 本リポジトリに関するエージェントからの回答は、すべて日本語で記述してください。

## Configuration Tips
- Store AWS credentials via environment variables or `.env.local`; never commit secrets.
- Update `next.config.ts` or `panda.config.ts` alongside code changes that depend on them, and document new config flags in the PR.
