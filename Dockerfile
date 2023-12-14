FROM node:14

WORKDIR /app

COPY package*.json ./
COPY . .

RUN npm install

ENV PORT=3000

EXPOSE 3000

CMD ["node", "app.js"]