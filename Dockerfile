FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends fontconfig fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

# Ensure data directory exists and is writable
RUN mkdir -p /data && chown -R node:node /data
# Also create local data dir just in case
RUN mkdir -p data && chown -R node:node data

USER node

EXPOSE 8080

CMD ["npm", "start"]