import { Server, Socket } from 'socket.io';
import { logger } from '@gx/core-logger';
import { WS_EVENTS, ROOM_PREFIX } from '../events';
import { messageRelayService } from '../../services/message-relay.service';
import { conversationService } from '../../services/conversation.service';
import {
  WsMessageSendPayload,
  WsMessageReceivedPayload,
  WsMessageDeliveredPayload,
  WsMessageReadPayload,
  WsErrorPayload,
  JWTPayload,
  MessageDTO,
} from '../../types/dtos';

/**
 * Sets up message-related WebSocket event handlers
 *
 * RELAY-ONLY MODE:
 * - Messages are NOT stored on the server
 * - Messages are relayed in real-time via WebSocket
 * - Offline users receive messages from Redis queue on reconnect
 * - All message storage happens on client devices (IndexedDB)
 */
export function setupMessageHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user as JWTPayload;

  /**
   * Deliver pending messages when user connects
   */
  (async () => {
    try {
      const pendingMessages = await messageRelayService.getPendingMessages(user.profileId);

      if (pendingMessages.length > 0) {
        logger.info(
          { profileId: user.profileId, count: pendingMessages.length },
          'Delivering pending messages to reconnected user'
        );

        // Group messages by conversation for efficient delivery
        const byConversation = new Map<string, MessageDTO[]>();
        for (const msg of pendingMessages) {
          const existing = byConversation.get(msg.conversationId) || [];
          existing.push(msg);
          byConversation.set(msg.conversationId, existing);
        }

        // Emit pending messages
        for (const [conversationId, messages] of byConversation) {
          socket.emit(WS_EVENTS.PENDING_MESSAGES, {
            conversationId,
            messages,
          });
        }
      }
    } catch (error) {
      logger.error({ error, profileId: user.profileId }, 'Failed to deliver pending messages');
    }
  })();

  /**
   * Handle sending a new message (RELAY MODE)
   */
  socket.on(WS_EVENTS.MESSAGE_SEND, async (payload: WsMessageSendPayload) => {
    try {
      logger.debug(
        { profileId: user.profileId, conversationId: payload.conversationId },
        'Received message for relay'
      );

      // Validate user is participant in conversation
      const isParticipant = await messageRelayService.isParticipant(
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

      // Prepare message for relay (NO DATABASE STORAGE)
      const message = await messageRelayService.prepareForRelay({
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
        clientMessageId: payload.clientMessageId,
        deliveredAt: new Date().toISOString(),
      } as WsMessageDeliveredPayload);

      // Get all participants except sender
      const participants = await messageRelayService.getConversationParticipants(
        payload.conversationId,
        user.profileId
      );

      // Check which participants are online
      const userRoom = ROOM_PREFIX.USER;
      const onlineParticipants: string[] = [];
      const offlineParticipants: string[] = [];

      for (const profileId of participants) {
        const roomSockets = await io.in(`${userRoom}${profileId}`).allSockets();
        if (roomSockets.size > 0) {
          onlineParticipants.push(profileId);
        } else {
          offlineParticipants.push(profileId);
        }
      }

      // Relay to online participants via conversation room
      socket.to(roomName).emit(WS_EVENTS.MESSAGE_RECEIVED, {
        message,
        clientMessageId: payload.clientMessageId,
      } as WsMessageReceivedPayload);

      // Queue for offline participants
      for (const profileId of offlineParticipants) {
        await messageRelayService.queueForOfflineUser(profileId, message);
      }

      // Update unread counts
      await messageRelayService.incrementUnreadCount(payload.conversationId, user.profileId);

      logger.info(
        {
          messageId: message.messageId,
          conversationId: payload.conversationId,
          onlineCount: onlineParticipants.length,
          offlineCount: offlineParticipants.length,
        },
        'Message relayed successfully'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to relay message');
      socket.emit(WS_EVENTS.MESSAGE_ERROR, {
        code: 'RELAY_FAILED',
        message: 'Failed to relay message',
        clientMessageId: payload.clientMessageId,
      } as WsErrorPayload);
    }
  });

  /**
   * Handle message read receipt
   * In relay mode, we just broadcast the read receipt and update unread count
   */
  socket.on(WS_EVENTS.MESSAGE_READ, async (payload: { messageId: string; conversationId: string }) => {
    try {
      // Mark conversation as read (not individual messages - those are client-side)
      await messageRelayService.markConversationAsRead(payload.conversationId, user.profileId);

      // Notify others that this user read messages
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      socket.to(roomName).emit(WS_EVENTS.MESSAGE_READ, {
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        readAt: new Date().toISOString(),
        readerProfileId: user.profileId,
      } as WsMessageReadPayload);

      logger.debug(
        { conversationId: payload.conversationId, profileId: user.profileId },
        'Read receipt relayed'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to process read receipt');
    }
  });

  /**
   * Handle message deletion request
   * In relay mode, we broadcast deletion request to other clients
   * Each client decides whether to delete locally
   */
  socket.on(WS_EVENTS.MESSAGE_DELETE, async (payload: { messageId: string; conversationId: string }) => {
    try {
      // Verify user is participant
      const isParticipant = await messageRelayService.isParticipant(
        payload.conversationId,
        user.profileId
      );

      if (!isParticipant) {
        socket.emit(WS_EVENTS.MESSAGE_ERROR, {
          code: 'NOT_PARTICIPANT',
          message: 'You are not a participant in this conversation',
        } as WsErrorPayload);
        return;
      }

      // Broadcast deletion to all clients in conversation
      // Note: Only the sender can request deletion, and clients will verify ownership
      const roomName = `${ROOM_PREFIX.CONVERSATION}${payload.conversationId}`;
      io.to(roomName).emit(WS_EVENTS.MESSAGE_DELETED, {
        messageId: payload.messageId,
        conversationId: payload.conversationId,
        deletedAt: new Date().toISOString(),
        deletedByProfileId: user.profileId,
      });

      logger.info(
        { messageId: payload.messageId, profileId: user.profileId },
        'Delete request relayed'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to relay delete request');
      socket.emit(WS_EVENTS.MESSAGE_ERROR, {
        code: 'DELETE_FAILED',
        message: 'Failed to relay delete request',
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
