# motvin-web — simple build.
# Put the live settings in .env.production first (NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_FIREBASE_*, …).
#   docker build -t motvin-web .
#   docker run -d -p 3001:3001 --name motvin-web motvin-web

FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Room for the build (it needs about 3 GB), and no usage reporting to Next.js.
ENV NODE_OPTIONS=--max-old-space-size=3072
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
