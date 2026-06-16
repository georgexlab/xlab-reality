# XLAB REALITY — Node app (static files + WebSocket relay + QR). Platform terminates TLS.
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV CLOUD=1
EXPOSE 8080
CMD ["node", "server.js"]
