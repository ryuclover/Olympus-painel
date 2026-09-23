# ==========================================
# STAGE 1: Compilação dos Frontends (React + Vite)
# ==========================================
FROM node:22-alpine AS build-frontends
WORKDIR /app

# 1. Compila o Olympus Painel (Frontend Principal)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

# 2. Compila o Olympus Admin
WORKDIR /app/olympus-admin
COPY olympus-admin/package.json olympus-admin/package-lock.json ./
RUN npm ci --ignore-scripts
COPY olympus-admin/index.html olympus-admin/tsconfig.json olympus-admin/vite.config.ts ./
COPY olympus-admin/src ./src
RUN npm run build

# ==========================================
# STAGE 2: Backend Python de Alta Performance
# ==========================================
FROM python:3.12-slim AS runner

# Variáveis de ambiente
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080 \
    OLYMPUS_LOG_LEVEL=INFO

WORKDIR /app

# Instala dependências do sistema e do Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copia dependências do backend
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt \
    && playwright install --with-deps chromium || true

# Copia código do backend
COPY backend/ ./backend/

# Copia frontends estáticos compilados do Stage 1
COPY --from=build-frontends /app/dist ./dist
COPY --from=build-frontends /app/olympus-admin/dist ./olympus-admin/dist

# Cria diretório de dados persistentes
RUN mkdir -p /root/.OlympusPainel/uploads

EXPOSE 8080

WORKDIR /app/backend
CMD ["python", "app.py"]
