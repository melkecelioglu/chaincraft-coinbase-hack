FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_FACTORY_ADDRESS
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PRIVY_APP_ID=$NEXT_PUBLIC_PRIVY_APP_ID
ENV NEXT_PUBLIC_FACTORY_ADDRESS=$NEXT_PUBLIC_FACTORY_ADDRESS

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

CMD ["node", "server.js"]
