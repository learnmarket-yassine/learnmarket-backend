FROM node:26-alpine AS builder

RUN apk add --no-cache libc6-compat openssl python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:26-alpine AS prod-deps

RUN apk add --no-cache libc6-compat openssl python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev --no-audit --no-fund && \
    npx prisma generate && \
    npm cache clean --force

FROM node:26-alpine AS runner

RUN apk add --no-cache libc6-compat openssl curl tini

WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./

USER nestjs

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS="--enable-source-maps"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1

ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","dist/main.js"]