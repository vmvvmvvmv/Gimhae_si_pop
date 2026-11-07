FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY public ./public
COPY tools ./tools

ARG VITE_NAVER_MAP_CLIENT_ID
ENV VITE_NAVER_MAP_CLIENT_ID=${VITE_NAVER_MAP_CLIENT_ID}
ENV VITE_API_BASE_URL=/api

RUN npm run build

FROM python:3.12-slim AS runtime
WORKDIR /app/server
COPY server/requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY server/app ./app
COPY public/data /app/public/data
COPY --from=frontend-build /app/dist /app/dist

# root 대신 전용 사용자로 실행합니다. server/data는 이 사용자가 쓸 수 있어야 합니다.
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --no-create-home app \
    && mkdir -p /app/server/data \
    && chown -R app:app /app/server/data
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=3).close()"
# 8000은 app_net 안에서만 열려 있고 Caddy만 접속합니다. 그래서 프록시 헤더를 모든 피어에서 신뢰해도 됩니다.
# ponytail: 네트워크에 다른 서비스가 붙으면 Caddy 컨테이너 IP로 좁힐 것.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
