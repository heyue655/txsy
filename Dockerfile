# ─────────────────────────────────────────────────────────────
# Stage 1: Build frontend (Vite)
# ─────────────────────────────────────────────────────────────
FROM docker.das-security.cn/node:22-alpine AS frontend-build
WORKDIR /frontend

COPY package.json ./
# npm sometimes skips the musl optional dep for rolldown on Alpine (known npm bug).
# Fix: run npm install, then explicitly install the matching musl native binding.
RUN npm install && \
    ROLLDOWN_VER=$(node -p "require('./node_modules/rolldown/package.json').version") && \
    npm install --no-save "@rolldown/binding-linux-x64-musl@${ROLLDOWN_VER}"

COPY . .
# Vite 6 warns about Node 22.6 but does NOT abort — the build still succeeds
RUN npx vite build
# output: /frontend/dist


# ─────────────────────────────────────────────────────────────
# Stage 2: Build backend (TypeScript → JS)
# ─────────────────────────────────────────────────────────────
FROM docker.das-security.cn/node:22-alpine AS backend-build
WORKDIR /backend

COPY server/package.json server/package-lock.json* ./
RUN npm ci

COPY server/ .
# Generate Prisma client before compiling
RUN npx prisma generate
RUN npm run build
# output: /backend/dist


# ─────────────────────────────────────────────────────────────
# Stage 3: Production image
# ─────────────────────────────────────────────────────────────
FROM docker.das-security.cn/node:22-alpine AS runner
WORKDIR /app

# Only copy production dependencies
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

# Backend compiled JS
COPY --from=backend-build /backend/dist ./dist

# Prisma client (generated in stage 2)
COPY --from=backend-build /backend/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-build /backend/node_modules/@prisma ./node_modules/@prisma

# Prisma schema (needed at runtime for migrations if required)
COPY server/prisma ./prisma

# Admin static page
COPY server/admin ./admin

# Frontend build output → served by Express as /public
COPY --from=frontend-build /frontend/dist ./public

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
