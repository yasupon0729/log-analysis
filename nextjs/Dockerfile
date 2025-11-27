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
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" bunx prisma generate
RUN bun run build

FROM oven/bun:1.3.1-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3729
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./

COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3729

CMD ["bun", "server.js"]
