/**
 * WebSocket Event Constants
 *
 * All events used for real-time messaging communication.
 * Events follow the pattern: {domain}:{action}
 */
export const WS_EVENTS = {
  // ==========================================
  // Connection Events
  // ==========================================
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  AUTH_ERROR: 'auth:error',

  // ==========================================
  // Message Events
  // ==========================================
  MESSAGE_SEND: 'message:send',
  MESSAGE_RECEIVED: 'message:received',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_ERROR: 'message:error',

  // ==========================================
  // Relay Mode Events (Client Storage)
  // ==========================================
  PENDING_MESSAGES: 'pending:messages',         // Offline messages delivered on reconnect
  SYNC_REQUEST: 'sync:request',                 // Client requests sync status
  SYNC_COMPLETE: 'sync:complete',               // Server confirms sync

  // ==========================================
  // Voice Message Events
  // ==========================================
  VOICE_UPLOAD_START: 'voice:upload:start',
  VOICE_UPLOAD_PROGRESS: 'voice:upload:progress',
  VOICE_UPLOAD_COMPLETE: 'voice:upload:complete',
  VOICE_UPLOAD_ERROR: 'voice:upload:error',

  // ==========================================
  // Typing Indicator Events
  // ==========================================
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  TYPING_UPDATE: 'typing:update',

  // ==========================================
  // Presence Events
  // ==========================================
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_QUERY: 'presence:query',
  PRESENCE_RESPONSE: 'presence:response',
  USER_ONLINE: 'user:online',
  USER_OFFLINE: 'user:offline',

  // ==========================================
  // Conversation Events
  // ==========================================
  CONVERSATION_CREATED: 'conversation:created',
  CONVERSATION_UPDATED: 'conversation:updated',
  CONVERSATION_DELETED: 'conversation:deleted',
  CONVERSATION_JOIN: 'conversation:join',
  CONVERSATION_LEAVE: 'conversation:leave',

  // ==========================================
  // Participant Events (Groups)
  // ==========================================
  PARTICIPANT_ADDED: 'participant:added',
  PARTICIPANT_REMOVED: 'participant:removed',
  PARTICIPANT_ROLE_CHANGED: 'participant:role:changed',

  // ==========================================
  // Key Exchange Events
  // ==========================================
  KEY_BUNDLE_REQUEST: 'key:bundle:request',
  KEY_BUNDLE_RESPONSE: 'key:bundle:response',
  KEY_ROTATION: 'key:rotation',
  KEY_ERROR: 'key:error',

  // ==========================================
  // Error Events
  // ==========================================
  ERROR: 'error',
  RATE_LIMITED: 'rate:limited',
} as const;

/**
 * Room naming conventions for Socket.io
 */
export const ROOM_PREFIX = {
  USER: 'user:',           // user:{profileId} - Personal room for user
  CONVERSATION: 'conv:',   // conv:{conversationId} - Conversation room
  TENANT: 'tenant:',       // tenant:{tenantId} - Tenant-wide broadcasts
} as const;

/**
 * Type for WebSocket event names
 */
export type WsEventName = typeof WS_EVENTS[keyof typeof WS_EVENTS];
