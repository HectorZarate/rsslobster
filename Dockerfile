FROM node:22-slim AS base

RUN corepack enable pnpm

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Build
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

# Production image
FROM node:22-slim AS runtime

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/dist/ dist/

# Site data is mounted as a volume
VOLUME /site
ENV RSSLOBSTER_SITE_DIR=/site

EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
CMD ["start", "--site-dir", "/site"]
