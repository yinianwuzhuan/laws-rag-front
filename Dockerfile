# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- 运行阶段 ----
FROM nginx:1.26-alpine

# 安装 envsubst 工具（gettext 包含）
RUN apk add --no-cache gettext

# 拷贝构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 拷贝 nginx 模板配置
COPY nginx.conf /etc/nginx/templates/default.conf.template

# 启动时用环境变量替换模板，再启动 nginx
CMD ["/bin/sh", "-c", "envsubst '$BACKEND_URL $PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]

EXPOSE 80
