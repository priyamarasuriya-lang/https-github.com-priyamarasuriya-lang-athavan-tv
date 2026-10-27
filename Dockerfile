# syntax=docker/dockerfile:1
# Multi-stage build for the BAT scheduling app (Next.js + Prisma). Not yet exercised on the
# development machine (Docker was unavailable there) — see README "Known limitations".

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd --system --uid 1001 bat && mkdir -p /app/storage/uploads && chown -R bat /app/storage
COPY --from=build --chown=bat /app/node_modules ./node_modules
COPY --from=build --chown=bat /app/.next ./.next
COPY --from=build --chown=bat /app/prisma ./prisma
COPY --from=build --chown=bat /app/package.json /app/next.config.ts ./
USER bat
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p 3000"]
