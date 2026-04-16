FROM node:20-alpine

# Build tools needed for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install ALL dependencies (dev needed for build)
RUN npm ci

# Copy all source files
COPY . .

# Build client (to dist/public/) + server (to dist/index.cjs)
RUN npm run build

# Remove dev dependencies after build to slim the image
RUN npm prune --production

# Railway dynamically assigns PORT — don't hardcode
ENV NODE_ENV=production

CMD ["node", "dist/index.cjs"]
