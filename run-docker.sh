#!/bin/bash

# Run Milo Docker Container
# This script builds and runs the Milo Discord bot

# Stop and remove existing container if it exists
docker stop milo 2>/dev/null
docker rm milo 2>/dev/null

# Build the image
echo "Building Docker image..."
docker build -t milo:latest .

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
    -v $(pwd)/data:/var/www/html/data \
    --name milo \
    milo:latest

# Wait for container to start
sleep 2

# Initialize database
echo "Initializing database..."
docker exec milo php /var/www/html/init_db.php

# Show container status
echo ""
echo "✅ Milo is running!"
echo ""
echo "📍 Endpoints:"
echo "   - Discord Interactions: http://localhost:9999/src/discord_interactions.php"
echo ""
echo "🔧 Useful commands:"
echo "   - View logs:        docker logs -f milo"
echo "   - Stop container:   docker stop milo"
echo "   - Restart:          docker restart milo"
echo "   - Run cron:         docker exec milo php /var/www/html/src/cron_process_messages.php"
echo "   - Shell access:     docker exec -it milo bash"
echo ""
echo "📝 Next steps:"
echo "   1. Use ngrok to expose port 9999 to the internet"
echo "   2. Set the Interactions Endpoint URL in Discord Developer Portal"
echo "   3. Set up a cron job to run message processing"
echo ""
