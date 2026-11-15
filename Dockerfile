# motvin-web: the Next.js site (landing page, Inspirations, Updates, …).
#
# Build:
#   docker build -t motvin-web \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.motvin.com \
#     --build-arg NEXT_PUBLIC_SITE_URL=https://motvin.com \
#     --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=… (and the other NEXT_PUBLIC_FIREBASE_* values) .
# Run:
#   docker run -p 3001:3001 motvin-web
#
# NEXT_PUBLIC_* values are written into the site's code when it is built, so they are build arguments:
# changing one means building again. Server-only settings (MOTVIN_AI_*, LEGACY_ORIGIN, …) are read at run time:
# pass them with `docker run -e NAME=value`.

# Dependencies, installed once from the lockfile.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# Build.
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# ARG NEXT_PUBLIC_API_BASE_URL=https://api.motvin.com
# ARG NEXT_PUBLIC_SITE_URL=https://motvin.com
# ARG NEXT_PUBLIC_FIREBASE_API_KEY
# ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
# ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
# ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
# ARG NEXT_PUBLIC_FIREBASE_APP_ID
# ARG NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
# ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
#     NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
#     NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
#     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
#     NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
#     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
#     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
#     NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
#     NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
#     NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Run: only the standalone server, the static files and public/.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/ >/dev/null || exit 1

CMD ["node", "server.js"]
