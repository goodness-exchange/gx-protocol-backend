import { Server, Socket } from 'socket.io';
import { logger } from '@gx/core-logger';
import { WS_EVENTS, ROOM_PREFIX } from '../events';
import { messageService } from '../../services/message.service';
import { conversationService } from '../../services/conversation.service';
import {
  WsMessageSendPayload,
  WsMessageReceivedPayload,
  WsMessageDeliveredPayload,
  WsMessageReadPayload,
  WsErrorPayload,
  JWTPayload,
} from '../../types/dtos';

/**
 * Sets up message-related WebSocket event handlers
 */
export function setupMessageHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user as JWTPayload;

  /**
   * Handle sending a new message
   */
  socket.on(WS_EVENTS.MESSAGE_SEND, async (payload: WsMessageSendPayload) => {
    try {
      logger.debug(
        { profileId: user.profileId, conversationId: payload.conversationId },
        'Received message send request'
      );

      // Validate user is participant in conversation
      const isParticipant = await conversationService.isParticipant(
        payload.conversationId,
        user.profileId
      );

      if (!isParticipant) {
        socket.emit(WS_EVENTS.MESSAGE_ERROR, {
          code: 'NOT_PARTICIPANT',
          message: 'You are not a participant in this conversation',
          details: { conversationId: payload.conversationId },
        } as WsErrorPayload);
        return;
      }

      // Create the message
      const message = await messageService.createMessage({
        conversationId: payload.conversationId,
        senderProfileId: user.profileId,
        type: payload.type,
        encryptedContent: payload.encryptedContent,
        contentNonce: payload.contentNonce,
        encryptionKeyId: payload.encryptionKeyId,
        replyToMessageId: payload.replyToMessageId,
        linkedTransactionId: payload.linkedTransactionId,
      });

      // Join conversation room if not already joined
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      socket.join(roomName);

      // Emit to sender as confirmation
      socket.emit(WS_EVENTS.MESSAGE_DELIVERED, {
        messageId: message.messageId,
        conversationId: payload.conversationId,
        deliveredAt: new Date().toISOString(),
      } as WsMessageDeliveredPayload);

      // Broadcast to other participants in the conversation
      socket.to(roomName).emit(WS_EVENTS.MESSAGE_RECEIVED, {
        message,
        clientMessageId: payload.clientMessageId,
      } as WsMessageReceivedPayload);

      logger.info(
        { messageId: message.messageId, conversationId: payload.conversationId },
        'Message sent successfully'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to send message');
      socket.emit(WS_EVENTS.MESSAGE_ERROR, {
        code: 'SEND_FAILED',
        message: 'Failed to send message',
      } as WsErrorPayload);
    }
  });

  /**
   * Handle message read receipt
   */
  socket.on(WS_EVENTS.MESSAGE_READ, async (payload: { messageId: string; conversationId: string }) => {
    try {
      await messageService.markAsRead(payload.messageId, user.profileId);

      // Notify the sender that message was read
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      socket.to(roomName).emit(WS_EVENTS.MESSAGE_READ, {
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        readAt: new Date().toISOString(),
        readerProfileId: user.profileId,
      } as WsMessageReadPayload);

      logger.debug(
        { messageId: payload.messageId, profileId: user.profileId },
        'Message marked as read'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to mark message as read');
    }
  });

  /**
   * Handle message deletion
   */
  socket.on(WS_EVENTS.MESSAGE_DELETE, async (payload: { messageId: string; conversationId: string }) => {
    try {
      await messageService.deleteMessage(payload.messageId, user.profileId);

      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      io.to(roomName).emit(WS_EVENTS.MESSAGE_DELETED, {
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        deletedAt: new Date().toISOString(),
        deletedByProfileId: user.profileId,
      });

      logger.info(
        { messageId: payload.messageId, profileId: user.profileId },
        'Message deleted'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to delete message');
      socket.emit(WS_EVENTS.MESSAGE_ERROR, {
        code: 'DELETE_FAILED',
        message: 'Failed to delete message',
      } as WsErrorPayload);
    }
  });

  /**
   * Handle joining a conversation room
   */
  socket.on(WS_EVENTS.CONVERSATION_JOIN, async (payload: { conversationId: string }) => {
    try {
      const isParticipant = await conversationService.isParticipant(
        payload.conversationId,
        user.profileId
      );

      if (!isParticipant) {
        socket.emit(WS_EVENTS.ERROR, {
          code: 'NOT_PARTICIPANT',
          message: 'You are not a participant in this conversation',
        } as WsErrorPayload);
        return;
      }

      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      socket.join(roomName);

      logger.debug(
        { conversationId: payload.conversationId, profileId: user.profileId },
        'Joined conversation room'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to join conversation');
    }
  });

  /**
   * Handle leaving a conversation room
   */
  socket.on(WS_EVENTS.CONVERSATION_LEAVE, async (payload: { conversationId: string }) => {
    const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
    socket.leave(roomName);

    logger.debug(
      { conversationId: payload.conversationId, profileId: user.profileId },
      'Left conversation room'
    );
  });
}
