/**
 * AiYou Assist - API Gateway
 *
 * Responsibilities:
 * - Authentication (JWT)
 * - Authorization
 * - Rate limiting
 * - Request validation
 * - Routing to internal services
 * - Correlation ID injection
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Logger
const logger = pinoHttp({
  level: process.env.LOG_LEVEL || 'info',
  redact: ['req.headers.authorization'],
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || '*',
  credentials: true,
}));

// Logger
app.use(logger);

// Correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
  });
});

// Rate limiter
const createRateLimiter = (windowMs, max) => rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use tenant ID if available, otherwise IP
    return req.tenantId || req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(windowMs / 1000),
    });
  },
});

// Global rate limiter
const globalLimiter = createRateLimiter(
  parseInt(process.env.RATE_LIMIT_WINDOW || '60') * 1000,
  parseInt(process.env.RATE_LIMIT_MAX || '100')
);

// Strict rate limiter for auth endpoints
const authLimiter = createRateLimiter(60 * 1000, 10);

// Authentication passthrough middleware
// Validates token presence but delegates verification to Core API (Sanctum)
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  // Pass through - Core API (Sanctum) handles token verification
  req.headers['x-correlation-id'] = req.correlationId;
  next();
};

// Optional authentication
const optionalAuth = async (req, res, next) => {
  req.headers['x-correlation-id'] = req.correlationId;
  next();
};

// Service URLs
const services = {
  core: process.env.CORE_API_URL || 'http://core-api:8000',
  billing: process.env.BILLING_API_URL || 'http://billing-api:8001',
  whatsapp: process.env.WHATSAPP_SERVICE_URL || 'http://whatsapp-service:8002',
  customerApi: process.env.CUSTOMER_API_URL || 'http://customer-api-service:8004',
};

// Proxy options generator
const createProxy = (target, pathRewrite = {}) => createProxyMiddleware({
  target,
  changeOrigin: true,
  pathRewrite,
  on: {
    proxyReq: (proxyReq, req) => {
      // Forward correlation ID and tenant info
      proxyReq.setHeader('X-Correlation-ID', req.correlationId);
      if (req.tenantId) {
        proxyReq.setHeader('X-Tenant-ID', req.tenantId);
      }
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.sub || req.user.id);
      }
      // If body was parsed by express, re-stream it
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
      }
    },
    error: (err, req, res) => {
      console.error('Proxy error:', err);
      if (res.headersSent) return;
      res.status(502).json({
        error: 'service_unavailable',
        message: 'The requested service is temporarily unavailable',
        correlationId: req.correlationId,
      });
    },
  },
});

// Routes

// Public routes (no auth)
app.use('/api/auth/register', authLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/auth/login', authLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/plans', optionalAuth, createProxy(services.core, { '^/api': '/api' }));

// Webhooks (no auth, but signature verification in services)
app.use('/api/webhooks', createProxy(services.core, { '^/api': '/api' }));

// Authenticated routes
app.use('/api/auth', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/tenant', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/users', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/whatsapp', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/admin', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));

// SaaS Portal routes (all proxied to core-api)
app.use('/api/overview', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/subscription', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/integrations', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/customer-api', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/webhook-endpoints', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/logs', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/audit', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/team', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));
app.use('/api/settings', requireAuth, globalLimiter, createProxy(services.core, { '^/api': '/api' }));

// Billing routes
app.use('/api/billing', requireAuth, globalLimiter, createProxy(services.billing, { '^/api/billing': '/api' }));

// WebSocket upgrade handling
app.use('/ws', requireAuth, createProxy(services.core, {
  ws: true,
  pathRewrite: { '^/ws': '/ws' },
}));

// Parse JSON for non-proxied routes
app.use(express.json({ limit: '10mb' }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: 'The requested endpoint does not exist',
    path: req.path,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: 'An unexpected error occurred',
    correlationId: req.correlationId,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📍 Core API: ${services.core}`);
  console.log(`📍 Billing API: ${services.billing}`);
  console.log(`📍 WhatsApp Service: ${services.whatsapp}`);
});
