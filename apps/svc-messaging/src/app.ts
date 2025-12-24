import express, { Application } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import helmet from 'helmet';
import cors from 'cors';
import { logger } from '@gx/core-logger';
import { errorHandler, requestLogger, metricsMiddleware } from '@gx/core-http';
import { messagingConfig } from './config';
import { authenticateSocket } from './middlewares/socket-auth.middleware';
import { setupMessageHandlers } from './websocket/handlers/message.handler';
import { setupTypingHandlers } from './websocket/handlers/typing.handler';
import { setupPresenceHandlers } from './websocket/handlers/presence.handler';
import { WS_EVENTS, ROOM_PREFIX } from './websocket/events';

// Route imports
import healthRoutes from './routes/health.routes';
import conversationRoutes from './routes/conversation.routes';
import messageRoutes from './routes/message.routes';
import voiceRoutes from './routes/voice.routes';
import keyRoutes from './routes/key.routes';
import groupRoutes from './routes/group.routes';
// Note: Compliance routes removed - relay-only mode with no server-side message storage

/**
 * Creates and configures the Express application with Socket.io
 */
export function createApp(): { app: Application; httpServer: HttpServer; io: SocketIOServer } {
  const app = express();
  const httpServer = createServer(app);

  // ============================================
  // Socket.io Server Setup
  // ============================================

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: messagingConfig.nodeEnv === 'production'
        ? messagingConfig.allowedOrigins.split(',')
        : '*',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingInterval: messagingConfig.wsHeartbeatIntervalMs,
    pingTimeout: messagingConfig.wsHeartbeatTimeoutMs,
  });

  // Redis adapter for horizontal scaling
  if (messagingConfig.redisUrl) {
    try {
      const pubClient = new Redis(messagingConfig.redisUrl);
      const subClient = pubClient.duplicate();

      pubClient.on('error', (err) => {
        logger.error({ error: err }, 'Redis pub client error');
      });

      subClient.on('error', (err) => {
        logger.error({ error: err }, 'Redis sub client error');
      });

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Socket.io Redis adapter configured');
    } catch (error) {
      logger.warn({ error }, 'Failed to configure Redis adapter, using default memory adapter');
    }
  }

  // Socket.io authentication middleware
  io.use(authenticateSocket);

  // Socket.io connection handler
  io.on(WS_EVENTS.CONNECT, (socket) => {
    const user = socket.data.user;
    logger.info({ profileId: user?.profileId, socketId: socket.id }, 'Client connected');

    if (user?.profileId) {
      // Join personal room
      socket.join(`${ROOM_PREFIX.USER}${user.profileId}`);

      // Setup event handlers
      setupMessageHandlers(io, socket);
      setupTypingHandlers(io, socket);
      setupPresenceHandlers(io, socket);
    }

    socket.on(WS_EVENTS.DISCONNECT, (reason) => {
      logger.info({ profileId: user?.profileId, socketId: socket.id, reason }, 'Client disconnected');
    });

    socket.on('error', (error) => {
      logger.error({ profileId: user?.profileId, socketId: socket.id, error }, 'Socket error');
    });
  });

  // ============================================
  // Express Security Middleware
  // ============================================

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }));

  app.use(cors({
    origin: messagingConfig.nodeEnv === 'production'
      ? messagingConfig.allowedOrigins.split(',')
      : '*',
    credentials: true,
  }));

  // ============================================
  // Body Parsing Middleware
  // ============================================

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ============================================
  // Observability Middleware
  // ============================================

  app.use(requestLogger);
  app.use(metricsMiddleware);

  // ============================================
  // Health Check Routes (before authentication)
  // ============================================

  app.use('/', healthRoutes);

  // ============================================
  // API Routes
  // ============================================

  app.use('/api/v1/conversations', conversationRoutes);
  app.use('/api/v1/messages', messageRoutes);
  app.use('/api/v1/voice', voiceRoutes);
  app.use('/api/v1/keys', keyRoutes);
  app.use('/api/v1/groups', groupRoutes);
  // Note: /api/v1/admin/compliance removed - relay-only mode

  // ============================================
  // 404 Handler
  // ============================================

  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
      path: req.path,
    });
  });

  // ============================================
  // Error Handler (must be last)
  // ============================================

  app.use(errorHandler);

  logger.info('Express application with Socket.io configured successfully');

  return { app, httpServer, io };
}
