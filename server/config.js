require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

// Fail fast if critical secrets are missing in production
if (isProduction) {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'POSTGRES_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables for production: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.JWT_SECRET === 'dev-secret-key') {
    console.error('JWT_SECRET must be changed from default value in production');
    process.exit(1);
  }
}

module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 3001,
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },

  database: {
    url: process.env.DATABASE_URL || `postgresql://postgres:${process.env.POSTGRES_PASSWORD || 'postgres'}@localhost:5432/nexus_db`,
    ssl: process.env.DATABASE_SSL === 'true'
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  client: {
    url: process.env.CLIENT_URL || 'http://localhost:3000'
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-key',
    sessionExpiry: parseInt(process.env.SESSION_EXPIRY) || 7 * 24 * 60 * 60 * 1000, // 7 days
    refreshExpiry: parseInt(process.env.REFRESH_EXPIRY) || 30 * 24 * 60 * 60 * 1000 // 30 days
  },

  features: {
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 2000,
    maxAttachments: parseInt(process.env.MAX_ATTACHMENTS) || 4,
    maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE) || 10 * 1024 * 1024, // 10MB
    enableGuestMode: process.env.ENABLE_GUEST_MODE === 'true' || process.env.ENABLE_GUEST_MODE === true
  },

  rateLimit: {
    messages: parseInt(process.env.RATE_LIMIT_MESSAGES) || 10,
    window: parseInt(process.env.RATE_LIMIT_WINDOW) || 10000 // 10 seconds
  }
};
