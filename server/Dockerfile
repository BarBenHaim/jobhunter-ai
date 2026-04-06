FROM node:20-alpine

# Install Chromium for Playwright scrapers
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont openssl

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma db push --skip-generate && npm start"]
