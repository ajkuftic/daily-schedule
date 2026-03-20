FROM node:22-alpine

RUN apk add --no-cache python3 make g++ sqlite

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
