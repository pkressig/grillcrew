FROM node:22-alpine

ENV NEXT_TELEMETRY_DISABLED=1 \
    TZ=Europe/Zurich

WORKDIR /code

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
