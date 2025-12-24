import { createApp } from './app';
import { messagingConfig } from './config';
import { logger } from '@gx/core-logger';
import { db } from '@gx/core-db';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

/**
 * Messaging Service - Entry Point
 *
 * This service handles:
 * - End-to-end encrypted messaging (Signal Protocol)
 * - Real-time WebSocket communication (Socket.io)
 * - Voice message storage and delivery
 * - Group conversations with key management
 * - Master key escrow for compliance
 */

let httpServer: HttpServer;
let io: SocketIOServer;

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  // Close Socket.io connections
  if (io) {
    io.close(() => {
      logger.info('Socket.io server closed');
    });
  }

  // Stop accepting new HTTP connections
  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
  }

  // Close database connections
  try {
    await db.$disconnect();
    logger.info('Database connections closed');
  } catch (error) {
    logger.error({ error }, 'Error closing database connections');
  }

  process.exit(0);
}

/**
 * Application startup
 */
async function start(): Promise<void> {
  try {
    // Validate database connection
    logger.info('Connecting to database...');
    await db.$connect();
    logger.info('Database connected successfully');

    // Create Express app with Socket.io
    const { httpServer: server, io: socketServer } = createApp();
    httpServer = server;
    io = socketServer;

    // Start HTTP server (serves both REST and WebSocket)
    httpServer.listen(messagingConfig.port, () => {
      logger.info({
        httpPort: messagingConfig.port,
        nodeEnv: messagingConfig.nodeEnv,
        logLevel: messagingConfig.logLevel,
        voiceEnabled: messagingConfig.voiceMessagesEnabled,
        groupsEnabled: messagingConfig.groupMessagesEnabled,
      }, 'Messaging Service started successfully');

      logger.info(`
        ╔════════════════════════════════════════════╗
        ║   GX Messaging Service                     ║
        ║   HTTP Port: ${messagingConfig.port}                          ║
        ║   Environment: ${messagingConfig.nodeEnv.padEnd(27)}║
        ║   Health: http://localhost:${messagingConfig.port}/health      ║
        ║   Metrics: http://localhost:${messagingConfig.port}/metrics    ║
        ║   WebSocket: ws://localhost:${messagingConfig.port}            ║
        ║                                            ║
        ║   Features:                                ║
        ║   • E2E Encryption: Enabled                ║
        ║   • Voice Messages: ${messagingConfig.voiceMessagesEnabled ? 'Enabled ' : 'Disabled'}               ║
        ║   • Group Chats: ${messagingConfig.groupMessagesEnabled ? 'Enabled ' : 'Disabled'}                  ║
        ║   • Master Key Escrow: ${messagingConfig.masterKeyEnabled ? 'Enabled ' : 'Disabled'}            ║
        ╚════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled Promise Rejection');
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start Messaging Service');
    process.exit(1);
  }
}

// Start the service
start();
