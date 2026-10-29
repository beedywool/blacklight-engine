# Blacklight relay server. Build the bundle first (pnpm --filter @blacklight/relay build), then:
#   docker build -t blacklight-relay servers/relay
#   docker run --rm -p 5360:5360 blacklight-relay
# dist/relay.cjs holds the server and ws in one file, so the image needs no npm install.
FROM node:24-alpine
WORKDIR /app
COPY dist/relay.cjs ./relay.cjs
ENV NODE_ENV=production BLACKLIGHT_RELAY_PORT=5360
EXPOSE 5360
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:5360/health >/dev/null || exit 1
CMD ["node", "relay.cjs"]
