FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY backend/package.json backend/package-lock.json* ./backend/
COPY frontend/package.json frontend/package-lock.json* ./frontend/

RUN npm install --prefix backend && npm install --prefix frontend

COPY backend ./backend
COPY frontend ./frontend

RUN npm run build --prefix frontend

FROM node:20-alpine
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix backend --omit=dev

COPY backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/backend
CMD ["node", "src/index.js"]
