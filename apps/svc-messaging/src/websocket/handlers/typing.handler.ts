import { Server, Socket } from 'socket.io';
import { logger } from '@gx/core-logger';
import { WS_EVENTS, ROOM_PREFIX } from '../events';
import { messagingConfig } from '../../config';
import { JWTPayload, WsTypingPayload, TypingIndicatorDTO } from '../../types/dtos';

// Track typing state with timeouts
const typingTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * Sets up typing indicator WebSocket event handlers
 */
export function setupTypingHandlers(_io: Server, socket: Socket): void {
  const user = socket.data.user as JWTPayload;

  if (!messagingConfig.typingIndicatorsEnabled) {
    return;
  }

  /**
   * Handle typing start event
   */
  socket.on(WS_EVENTS.TYPING_START, (payload: WsTypingPayload) => {
    try {
      const typingKey = `${payload.conversationId}:${user.profileId}`;
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;

      // Clear existing timeout if any
      const existingTimeout = typingTimeouts.get(typingKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      // Broadcast typing indicator to other participants
      socket.to(roomName).emit(WS_EVENTS.TYPING_UPDATE, {
        conversationId: payload.conversationId,
        profileId: user.profileId,
        displayName: user.email?.split('@')[0] || 'User', // Basic display name
        isTyping: true,
      } as TypingIndicatorDTO);

      // Auto-stop typing after 5 seconds
      const timeout = setTimeout(() => {
        socket.to(roomName).emit(WS_EVENTS.TYPING_UPDATE, {
          conversationId: payload.conversationId,
          profileId: user.profileId,
          displayName: user.email?.split('@')[0] || 'User',
          isTyping: false,
        } as TypingIndicatorDTO);
        typingTimeouts.delete(typingKey);
      }, 5000);

      typingTimeouts.set(typingKey, timeout);

      logger.debug(
        { conversationId: payload.conversationId, profileId: user.profileId },
        'Typing started'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to handle typing start');
    }
  });

  /**
   * Handle typing stop event
   */
  socket.on(WS_EVENTS.TYPING_STOP, (payload: WsTypingPayload) => {
    try {
      const typingKey = `${payload.conversationId}:${user.profileId}`;
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;

      // Clear timeout
      const existingTimeout = typingTimeouts.get(typingKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        typingTimeouts.delete(typingKey);
      }

      // Broadcast typing stopped
      socket.to(roomName).emit(WS_EVENTS.TYPING_UPDATE, {
        conversationId: payload.conversationId,
        profileId: user.profileId,
        displayName: user.email?.split('@')[0] || 'User',
        isTyping: false,
      } as TypingIndicatorDTO);

      logger.debug(
        { conversationId: payload.conversationId, profileId: user.profileId },
        'Typing stopped'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to handle typing stop');
    }
  });

  // Clean up typing state on disconnect
  socket.on(WS_EVENTS.DISCONNECT, () => {
    // Clear all typing timeouts for this user
    typingTimeouts.forEach((timeout, key) => {
      if (key.endsWith(`:${user.profileId}`)) {
        clearTimeout(timeout);
        typingTimeouts.delete(key);
      }
    });
  });
}
