# Project Overview
- **Purpose**: Next.js 15 web UI for a log analysis dashboard that fetches and inspects logs stored in S3. Demonstrates both server/client side logging via a shared logger.
- **Tech Stack**: Next.js App Router (React 19, TypeScript), Panda CSS, Biome for lint/format, Pino-based logging utilities, Bun lockfile included but npm scripts used.
- **Structure**: `src/app` for routes (notably home page with client/server components), `src/lib` for shared utilities (`api`, `logger`), `src/components` for UI pieces, `src/styles` for Panda CSS tokens/helpers, `public` for static assets. Logging configuration lives in `src/lib/logger`, API client helpers (including S3) in `src/lib/api`.
- **Notable Config**: `next.config.ts` for Next.js settings, `panda.config.ts` for styling tokens, `biome` CLI handles lint/format, `tsconfig.json` standard TS config.
