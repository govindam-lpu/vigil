# Cloud Run build for the Vigil OCR/extraction worker (source lives in worker/).
# Built from the repo root because the worker imports ../lib/ai and ../lib/types.
# Do NOT set PORT/EXPOSE here: Cloud Run injects PORT and the worker reads process.env.PORT.
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
CMD ["npm", "run", "worker"]
