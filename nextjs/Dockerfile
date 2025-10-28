# syntax=docker/dockerfile:1

FROM oven/bun:1.3.1-slim AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN BUN_INSTALL_FROZEN_LOCKFILE=0 bun install

FROM oven/bun:1.3.1-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx panda codegen
RUN bun run build

FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3729
ENV HOSTNAME=0.0.0.0

COPY package.json bun.lock* ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/styled-system ./styled-system

EXPOSE 3729

CMD ["bun", "run", "start"]
