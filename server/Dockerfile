FROM node:20-alpine

# Install PostgreSQL client and Redis client
RUN apk add --no-cache postgresql-client redis

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY . .

# Make entrypoint script executable
RUN chmod +x /app/docker-entrypoint.sh

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3001

# Use entrypoint script
ENTRYPOINT ["/app/docker-entrypoint.sh"]
