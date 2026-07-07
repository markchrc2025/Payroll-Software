# Sentire Payroll — container image for Sliplane (or any Docker host).
#
# Single-stage on purpose: the full node_modules (incl. the Prisma CLI) is kept
# so `prisma migrate deploy` can run on start. pg-boss workers/crons run
# in-process, so ONE running container/instance is expected. If you ever scale
# to multiple instances, move `prisma migrate deploy` to a one-off release step
# and gate the job workers to a single instance.
#
# NOTE: the existing Render service is a "Node" environment and ignores this
# Dockerfile; it only affects Docker-based hosts (Sliplane).

FROM node:20-bookworm-slim

# Prisma needs OpenSSL at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching. NODE_ENV is unset here so dev
# dependencies (Prisma CLI, build tooling) are installed.
COPY package.json package-lock.json ./
RUN npm ci

# App source + build.
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Apply any pending migrations, then start the server (which boots pg-boss).
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT:-3000}"]
