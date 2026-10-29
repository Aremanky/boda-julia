FROM node:22-alpine
WORKDIR /app
COPY server.js package.json ./
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
