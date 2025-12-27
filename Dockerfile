FROM node:20-slim

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