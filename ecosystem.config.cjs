/**
 * AiYou Assist - PM2 Ecosystem Config
 * Process management with resource protection
 */

const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  apps: [
    // API Gateway
    {
      name: 'api-gateway',
      cwd: './services/api-gateway',
      script: 'src/index.js',
      instances: 1,
      max_memory_restart: '200M',
      env: {
        PORT: 8080,
        NODE_ENV: 'production',
        REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:6379`,
        CORE_API_URL: 'http://127.0.0.1:8000',
        BILLING_API_URL: 'http://127.0.0.1:8001',
        WHATSAPP_SERVICE_URL: 'http://127.0.0.1:8002',
        CUSTOMER_API_URL: 'http://127.0.0.1:8004',
        JWT_SECRET: process.env.JWT_SECRET,
        CORS_ORIGINS: 'https://meuaiyou.cloud,https://app.meuaiyou.cloud',
        RATE_LIMIT_WINDOW: '60',
        RATE_LIMIT_MAX: '100',
      },
    },

    // ClawdBot Connector (formerly whatsapp-service)
    {
      name: 'clawdbot-connector',
      cwd: './services/whatsapp-service',
      script: 'src/index.js',
      instances: 1,
      max_memory_restart: '200M',
      env: {
        PORT: 8002,
        NODE_ENV: 'production',
        DATABASE_URL: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@127.0.0.1:5432/${process.env.DB_NAME}`,
        REDIS_URL: `redis://:${process.env.REDIS_PASSWORD}@127.0.0.1:6379`,
        SESSION_ENCRYPTION_KEY: process.env.SESSION_ENCRYPTION_KEY,
        CLAUDBOT_GATEWAY_URL: 'ws://127.0.0.1:18789',
        CLAUDBOT_GATEWAY_TOKEN: '3cd2720a6b91dc49637f8d9614646c75a76af620eb88bb76c2ca55d15a777963',
      },
    },

    // Core API (Laravel)
    {
      name: 'core-api',
      cwd: './services/core-api',
      script: 'artisan',
      args: 'serve --host=127.0.0.1 --port=8000',
      interpreter: 'php',
      instances: 1,
      max_memory_restart: '300M',
      exec_mode: 'fork',
    },

  ],
};
