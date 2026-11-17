FROM node:24-bookworm-slim AS verify
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
COPY tests ./tests
COPY scripts ./scripts
RUN npm test

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
COPY --from=verify /app/node_modules ./node_modules
COPY --from=verify /app/package.json ./package.json
COPY --from=verify /app/server ./server
COPY --from=verify /app/public ./public
COPY --from=verify /app/scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/app.mjs"]
