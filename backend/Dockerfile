FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
RUN mkdir -p /app/storage && chown -R node:node /app
USER node
ENV NODE_ENV=production STORAGE_DIR=/app/storage
EXPOSE 3001
CMD ["node","src/server.js"]
