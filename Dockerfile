FROM node:20-alpine

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source
COPY . .

# Build client + server
RUN npm run build

# Expose port (Railway sets PORT env var)
EXPOSE 5000

# Start production server
CMD ["node", "dist/index.cjs"]
