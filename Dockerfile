# Use an official Node runtime as a parent image
FROM node:20-slim

# Install system dependencies required by pg and sqlite3 as well as cron.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libsqlite3-dev \
        libpq-dev \
        postgresql-client \
        cron \
        gosu \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json if present
COPY package*.json ./

# Install only production dependencies
RUN npm install --production

# Copy source code
COPY . .

# Copy and set up permission fix script
COPY fix-permissions.sh /usr/local/bin/fix-permissions.sh
RUN chmod +x /usr/local/bin/fix-permissions.sh

# Ensure writable data directory
RUN mkdir -p /usr/src/app/data && chown -R node:node /usr/src/app/data

# Create /data directory with proper permissions for Railway volume
RUN mkdir -p /data && chmod 777 /data

# DON'T switch user yet - the entrypoint needs to run as root to fix permissions
# USER node will be handled by the script

# Expose port 80 as the web server port
EXPOSE 80

# Use the script as entrypoint to fix permissions, then run as node user
ENTRYPOINT ["/usr/local/bin/fix-permissions.sh"]

# Default command to run the interaction server
CMD ["gosu", "node", "node", "src/index.js"]