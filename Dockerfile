FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV BENJOJI_DATA_DIR=/app/data

EXPOSE 3000

CMD ["npm", "start"]
