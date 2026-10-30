# ==========================================
# STAGE 1: Build Client (Vite + React)
# ==========================================
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ==========================================
# STAGE 2: Build Server (TypeScript)
# ==========================================
FROM node:20-alpine AS server-builder
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# ==========================================
# STAGE 3: Production Runner
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy built server
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

COPY --from=server-builder /app/server/dist ./server/dist

# Copy built client for static serving
COPY --from=client-builder /app/client/dist ./client/dist

EXPOSE 3001

CMD ["node", "server/dist/index.js"]
