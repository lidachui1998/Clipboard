FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY public ./public

RUN mkdir -p uploads

ENV NODE_ENV=production
ENV PORT=13847
EXPOSE 13847

CMD ["node", "server.js"]
