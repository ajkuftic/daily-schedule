FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    NODE_OPTIONS=--disable-warning=DEP0040

EXPOSE 3000

CMD ["node", "src/server.js"]
