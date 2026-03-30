# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS builder

# 【加速】替换 Alpine 软件源为阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install build dependencies for better-sqlite3 and git for VitePress
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 【加速】设置 pnpm 淘宝镜像源
RUN pnpm config set registry https://registry.npmmirror.com

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies with pnpm store cache
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build with Nuxt cache
RUN --mount=type=cache,target=/app/node_modules/.cache \
    pnpm build

# Production stage
FROM node:20-alpine AS runner

# 【加速】替换 Alpine 软件源为阿里云镜像
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories

# Install runtime dependencies for better-sqlite3, python3, pip, and npx
# 【加速】使用清华源安装 Python 依赖
RUN apk add --no-cache libstdc++ python3 py3-pip npm && \
    pip3 install uv --break-system-packages -i https://pypi.tuna.tsinghua.edu.cn/simple

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nuxt

# Copy built application
COPY --from=builder --chown=nuxt:nodejs /app/.output /app/.output

# Copy database migrations (for auto-migration on startup)
COPY --from=builder --chown=nuxt:nodejs /app/server/database/migrations /app/server/database/migrations

# Create data directory for SQLite
RUN mkdir -p /app/data && chown nuxt:nodejs /app/data

USER nuxt

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]