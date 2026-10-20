# 已迁移：生产构建请用 deploy/docker/frontend.Dockerfile（由 docker-compose 引用）。
# 本文件保留便于单独在本目录试验构建。
FROM node:20-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ARG VITE_WS_URL=/socket.io
ARG VITE_USE_MOCK=false
ARG VITE_WHEP_URL=/mtx/cam1/whep
ARG VITE_TALK_WHEP_URL=/mtx/cam4/whep
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_WS_URL=$VITE_WS_URL \
    VITE_USE_MOCK=$VITE_USE_MOCK \
    VITE_WHEP_URL=$VITE_WHEP_URL \
    VITE_TALK_WHEP_URL=$VITE_TALK_WHEP_URL
RUN npm run build
FROM nginx:1.27-alpine
COPY --from=build /src/dist /usr/share/nginx/html
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
