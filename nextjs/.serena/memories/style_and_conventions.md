# Style and Conventions
- Use TypeScript with `strict` mode; prefer server/client components split following Next.js App Router patterns.
- Import shared code through path aliases (`@/` for `src`, `@/styled-system` for Panda CSS utilities).
- Follow Biome's defaults (`biome.json` implicit) for formatting/linting; run `npm run format` before committing to keep consistent style.
- Logging uses Pino wrappers in `src/lib/logger`; prefer structured log objects with contextual metadata rather than string concatenation.
- React components use functional components, hooks, and Panda CSS `css` helper for styling.
