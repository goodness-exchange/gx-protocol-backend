/**
 * Messaging Service DTOs (Data Transfer Objects)
 *
 * These types define the shape of data exchanged between
 * clients and the messaging service.
 */

// ==========================================
// Enums (matching Prisma schema)
// ==========================================

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export enum MessageType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
  SYSTEM = 'SYSTEM',
  TRANSACTION_REF = 'TRANSACTION_REF',
}

export enum MessageStatus {
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

export enum ParticipantRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum MasterKeyDecryptionReason {
  CRIMINAL_INVESTIGATION = 'CRIMINAL_INVESTIGATION',
  COURT_ORDER = 'COURT_ORDER',
  REGULATORY_COMPLIANCE = 'REGULATORY_COMPLIANCE',
  FRAUD_PREVENTION = 'FRAUD_PREVENTION',
  AML_INVESTIGATION = 'AML_INVESTIGATION',
}

// ==========================================
// JWT Payload
// ==========================================

export interface JWTPayload {
  profileId: string;
  email: string;
  status: string;
  iat?: number;
  exp?: number;
}

// ==========================================
// Conversation DTOs
// ==========================================

export interface CreateConversationDTO {
  type: ConversationType;
  name?: string;
  participantIds: string[];
  linkedTransactionId?: string;
}

export interface ConversationDTO {
  conversationId: string;
  type: ConversationType;
  name: string | null;
  linkedTransactionId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  unreadCount: number;
  participants: ParticipantDTO[];
  lastMessage?: MessagePreviewDTO;
}

export interface ConversationListDTO {
  conversations: ConversationDTO[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface UpdateConversationDTO {
  name?: string;
}

// ==========================================
// Participant DTOs
// ==========================================

export interface ParticipantDTO {
  participantId: string;
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  role: ParticipantRole;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface AddParticipantsDTO {
  profileIds: string[];
}

// ==========================================
// Message DTOs
// ==========================================

export interface SendMessageDTO {
  type: MessageType;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  replyToMessageId?: string;
  linkedTransactionId?: string;
}

export interface MessageDTO {
  messageId: string;
  conversationId: string;
  senderProfileId: string;
  senderDisplayName: string;
  senderAvatarUrl: string | null;
  type: MessageType;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  voiceDurationMs: number | null;
  voiceStorageKey: string | null;
  linkedTransactionId: string | null;
  replyToMessageId: string | null;
  status: MessageStatus;
  createdAt: string;
  editedAt: string | null;
  deliveryReceipts: DeliveryReceiptDTO[];
}

export interface MessagePreviewDTO {
  messageId: string;
  senderProfileId: string;
  senderDisplayName: string;
  type: MessageType;
  previewText: string;
  createdAt: string;
}

export interface MessageListDTO {
  messages: MessageDTO[];
  pagination: {
    limit: number;
    cursor: string | null;
    hasMore: boolean;
  };
}

export interface DeliveryReceiptDTO {
  recipientProfileId: string;
  deliveredAt: string | null;
  readAt: string | null;
}

// ==========================================
// Voice Message DTOs
// ==========================================

export interface VoiceMessageUploadDTO {
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  durationMs: number;
  mimeType: string;
}

export interface VoiceMessageDTO {
  messageId: string;
  voiceStorageKey: string;
  durationMs: number;
  downloadUrl: string;
  expiresAt: string;
}

// ==========================================
// Key Exchange DTOs
// ==========================================

export interface RegisterKeysDTO {
  identityKeyPublic: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  preKeys: PreKeyDTO[];
}

export interface PreKeyDTO {
  keyIndex: number;
  publicKey: string;
}

export interface KeyBundleDTO {
  profileId: string;
  identityKeyPublic: string;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  preKey: PreKeyDTO | null;
}

export interface GroupKeyDTO {
  keyId: string;
  conversationId: string;
  keyVersion: number;
  encryptedKey: string;
}

// ==========================================
// Typing Indicator DTOs
// ==========================================

export interface TypingIndicatorDTO {
  conversationId: string;
  profileId: string;
  displayName: string;
  isTyping: boolean;
}

// ==========================================
// Presence DTOs
// ==========================================

export interface PresenceDTO {
  profileId: string;
  isOnline: boolean;
  lastSeenAt: string;
}

export interface PresenceUpdateDTO {
  profileIds: string[];
  presence: PresenceDTO[];
}

// ==========================================
// Compliance DTOs
// ==========================================

export interface DecryptionRequestDTO {
  targetType: 'MESSAGE' | 'CONVERSATION' | 'USER';
  targetMessageId?: string;
  targetConversationId?: string;
  targetProfileId?: string;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  reason: MasterKeyDecryptionReason;
  caseNumber?: string;
  courtOrderNumber?: string;
  justification: string;
}

export interface DecryptionAuditDTO {
  auditId: string;
  requestedByAdminId: string;
  requestedByName: string;
  targetType: 'MESSAGE' | 'CONVERSATION' | 'USER';
  targetId: string;
  reason: MasterKeyDecryptionReason;
  justification: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  approvedByAdminId: string | null;
  approvedByName: string | null;
  messagesDecrypted: number;
  createdAt: string;
  approvedAt: string | null;
  executedAt: string | null;
}

export interface DecryptedMessageDTO {
  messageId: string;
  conversationId: string;
  senderProfileId: string;
  senderDisplayName: string;
  type: MessageType;
  decryptedContent: string;
  voiceTranscription?: string;
  linkedTransactionId: string | null;
  createdAt: string;
}

// ==========================================
// WebSocket Event Payloads
// ==========================================

export interface WsMessageSendPayload {
  conversationId: string;
  type: MessageType;
  encryptedContent: string;
  contentNonce: string;
  encryptionKeyId: string;
  replyToMessageId?: string;
  linkedTransactionId?: string;
  clientMessageId?: string;
}

export interface WsMessageReceivedPayload {
  message: MessageDTO;
  clientMessageId?: string;
}

export interface WsMessageDeliveredPayload {
  messageId: string;
  conversationId: string;
  deliveredAt: string;
}

export interface WsMessageReadPayload {
  messageId: string;
  conversationId: string;
  readAt: string;
  readerProfileId: string;
}

export interface WsTypingPayload {
  conversationId: string;
}

export interface WsPresencePayload {
  profileIds: string[];
}

export interface WsErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ==========================================
// API Response Wrappers
// ==========================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset?: number;
    cursor?: string;
    hasMore: boolean;
    total?: number;
  };
}
