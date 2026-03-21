FROM node:22-slim AS base

RUN corepack enable pnpm

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

# Production image
FROM node:22-slim AS runtime

RUN corepack enable pnpm

# Create non-root user
RUN addgroup --system lobster && adduser --system --ingroup lobster lobster

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/dist/ dist/

# Site data directory — mount via -v /your/site:/site
RUN mkdir -p /site && chown lobster:lobster /site
ENV RSSLOBSTER_SITE_DIR=/site

USER lobster

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
CMD ["start", "--site-dir", "/site"]
