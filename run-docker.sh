#!/bin/bash

# Run Milo Docker Container (Node.js version)
#
# This script builds and runs the Milo Discord bot. It mimics the
# convenience of the original PHP project's run-docker.sh. You still
# need to edit the .env file with your credentials before running.

# Stop and remove existing container if it exists
docker stop milo 2>/dev/null
docker rm milo 2>/dev/null

# Build the image
echo "Building Docker image..."
docker build -t milo:latest . || exit 1

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "Please edit .env with your actual credentials before running the container."
    exit 1
fi

# Run the container
echo "Starting Milo container..."
docker run -d \
    -p 9999:80 \
    --env-file .env \
    -v $(pwd)/data:/usr/src/app/data \
    --name milo \
    milo:latest

# Wait for container to start
sleep 2

# Initialise database (SQLite by default)
echo "Initialising database..."
docker exec milo node init_db.js

# Show container status
echo ""
echo "✅ Milo is running!"
echo ""
echo " Endpoints:"
echo "   - Discord Interactions: http://localhost:9999/discord_interactions"
echo ""
echo " Useful commands:"
echo "   - View logs:        docker logs -f milo"
echo "   - Stop container:   docker stop milo"
echo "   - Restart:          docker restart milo"
echo "   - Run cron:         docker exec milo node src/cron_process_messages.js"
echo "   - Shell access:     docker exec -it milo bash"
echo ""
echo " Next steps:"
echo "   1. Use ngrok or a reverse proxy to expose port 9999 to the internet."
echo "   2. Set the Interactions Endpoint URL in Discord Developer Portal."
echo "   3. Set up a cron job to run message processing."
echo ""