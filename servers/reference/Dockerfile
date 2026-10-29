# Blacklight reference server: Node 24 runs the TypeScript sources directly (type stripping) and the
# server has no npm dependencies, so the image is the Node runtime plus a few source files.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app
COPY package.json ./
COPY src ./src

# The database lives in /data, owned by the unprivileged `node` user of the base image.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

CMD ["node", "src/index.ts"]
