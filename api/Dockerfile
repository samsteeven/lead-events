# Image unique pour l'API et le consumer (commandes différentes) ; la cible « migrate » applique les migrations Prisma.
FROM node:24-alpine AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# Applique les migrations (service « migrate » du compose), puis s'arrête.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
# Client Prisma généré (le paquet « prisma » qui le génère n'est qu'une dépendance de développement).
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
