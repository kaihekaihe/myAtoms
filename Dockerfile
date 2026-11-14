# AtomLab 生产镜像。better-sqlite3 为原生模块，在容器内安装以保证与运行时 ABI 一致。
# 注：不加 # syntax= 指令，构建时不需要从 Docker Hub 拉取 frontend 镜像（国内网络友好）。

# ---------- 1. 安装依赖 ----------
FROM node:22-slim AS deps
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. 构建 ----------
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- 3. 运行 ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DB_PATH=/data/atomlab.db
# SQLite 数据目录：持久化卷挂载点（与镜像解耦，备份 = 复制单个文件）
RUN useradd --create-home --uid 1001 app \
  && mkdir -p /data \
  && chown -R app:app /data
COPY --from=builder --chown=app:app /app ./
VOLUME ["/data"]
USER app
EXPOSE 3000
CMD ["npm", "run", "start"]