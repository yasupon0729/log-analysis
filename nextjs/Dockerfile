# syntax=docker/dockerfile:1

FROM oven/bun:1.2.17-slim AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN BUN_INSTALL_FROZEN_LOCKFILE=0 bun install

FROM oven/bun:1.2.17-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:1.2.17-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3729
ENV HOSTNAME=0.0.0.0

COPY package.json bun.lock* ./
RUN BUN_INSTALL_FROZEN_LOCKFILE=0 bun install --production

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

EXPOSE 3729

CMD ["bun", "run", "start"]
