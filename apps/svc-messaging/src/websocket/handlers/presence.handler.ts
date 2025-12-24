import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { logger } from '@gx/core-logger';
import { WS_EVENTS } from '../events';
import { messagingConfig } from '../../config';
import { JWTPayload, WsPresencePayload, PresenceDTO, PresenceUpdateDTO } from '../../types/dtos';

// Redis client for presence storage (optional, falls back to in-memory)
let redisClient: Redis | null = null;

// In-memory presence store (fallback)
const presenceStore = new Map<string, { isOnline: boolean; lastSeenAt: Date }>();

// Initialize Redis client if configured
try {
  if (messagingConfig.redisUrl) {
    redisClient = new Redis(messagingConfig.redisUrl);
    redisClient.on('error', (err) => {
      logger.warn({ error: err }, 'Presence Redis client error, using in-memory store');
      redisClient = null;
    });
  }
} catch (error) {
  logger.warn({ error }, 'Failed to initialize presence Redis client');
}

/**
 * Sets up presence (online status) WebSocket event handlers
 */
export function setupPresenceHandlers(io: Server, socket: Socket): void {
  const user = socket.data.user as JWTPayload;

  /**
   * Update user presence on connect
   */
  updatePresence(user.profileId, true);

  // Broadcast that user came online
  io.emit(WS_EVENTS.USER_ONLINE, {
    profileId: user.profileId,
    isOnline: true,
    lastSeenAt: new Date().toISOString(),
  } as PresenceDTO);

  /**
   * Handle presence query for specific users
   */
  socket.on(WS_EVENTS.PRESENCE_QUERY, async (payload: WsPresencePayload) => {
    try {
      const presence = await getPresenceForUsers(payload.profileIds);

      socket.emit(WS_EVENTS.PRESENCE_RESPONSE, {
        profileIds: payload.profileIds,
        presence,
      } as PresenceUpdateDTO);

      logger.debug(
        { requestedProfiles: payload.profileIds.length },
        'Presence query handled'
      );
    } catch (error) {
      logger.error({ error, payload }, 'Failed to handle presence query');
    }
  });

  /**
   * Update presence on disconnect
   */
  socket.on(WS_EVENTS.DISCONNECT, () => {
    updatePresence(user.profileId, false);

    // Broadcast that user went offline
    io.emit(WS_EVENTS.USER_OFFLINE, {
      profileId: user.profileId,
      isOnline: false,
      lastSeenAt: new Date().toISOString(),
    } as PresenceDTO);
  });
}

/**
 * Update user presence in storage
 */
async function updatePresence(profileId: string, isOnline: boolean): Promise<void> {
  const now = new Date();

  if (redisClient) {
    try {
      const key = `presence:${profileId}`;
      const value = JSON.stringify({ isOnline, lastSeenAt: now.toISOString() });

      if (isOnline) {
        // Set with 5 minute TTL - will be refreshed by heartbeat
        await redisClient.setex(key, 300, value);
      } else {
        // Keep last seen for 24 hours
        await redisClient.setex(key, 86400, value);
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to update presence in Redis');
      // Fallback to in-memory
      presenceStore.set(profileId, { isOnline, lastSeenAt: now });
    }
  } else {
    presenceStore.set(profileId, { isOnline, lastSeenAt: now });
  }
}

/**
 * Get presence for multiple users
 */
async function getPresenceForUsers(profileIds: string[]): Promise<PresenceDTO[]> {
  const results: PresenceDTO[] = [];

  for (const profileId of profileIds) {
    let presence: { isOnline: boolean; lastSeenAt: string } | null = null;

    if (redisClient) {
      try {
        const key = `presence:${profileId}`;
        const value = await redisClient.get(key);
        if (value) {
          presence = JSON.parse(value);
        }
      } catch (error) {
        logger.warn({ error, profileId }, 'Failed to get presence from Redis');
      }
    }

    if (!presence) {
      const stored = presenceStore.get(profileId);
      if (stored) {
        presence = {
          isOnline: stored.isOnline,
          lastSeenAt: stored.lastSeenAt.toISOString(),
        };
      }
    }

    results.push({
      profileId,
      isOnline: presence?.isOnline ?? false,
      lastSeenAt: presence?.lastSeenAt ?? new Date(0).toISOString(),
    });
  }

  return results;
}
