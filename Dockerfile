# Use an official Node runtime as a parent image
FROM node:20-slim

# Install system dependencies required by pg and sqlite3 as well as cron.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libsqlite3-dev \
        libpq-dev \
        postgresql-client \
        cron \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json if present
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy source code
COPY . .

# Ensure writable data directory
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# If using Railway volume at /data, try to make it accessible
# This runs as root before switching to node user
RUN mkdir -p /data && chown -R node:node /data 2>/dev/null || true

# Switch to non-root user for safety
USER node

# Expose port 80 as the web server port
EXPOSE 80

# Default command to run the interaction server
CMD ["node", "src/index.js"]