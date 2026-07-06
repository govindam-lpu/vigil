# Vigil OCR/extraction worker (Node). Build from the REPO ROOT (it imports ../lib/ai):
#   docker build -f worker/Dockerfile -t vigil-worker .
FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev because the worker runs via tsx (a devDependency).
RUN npm ci --include=dev
COPY . .

ENV PORT=8787
EXPOSE 8787
CMD ["npm", "run", "worker"]
