// OpenPhone API types
// API Documentation: https://docs.openphone.com/reference/introduction

export interface OpenPhoneConfig {
  apiKey: string;
  webhookSecret?: string;
  baseUrl?: string;
}

export type CallDirection = 'incoming' | 'outgoing';
export type CallStatus = 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
export type MessageDirection = 'incoming' | 'outgoing';

// Webhook event types
export interface OpenPhoneWebhookEvent {
  id: string;
  object: string;
  type: WebhookEventType;
  createdAt: string;
  data: WebhookEventData;
}

export type WebhookEventType =
  | 'call.initiated'
  | 'call.completed'
  | 'message.created'
  | 'message.updated'
  | 'voicemail.created';

export interface WebhookEventData {
  object: CallObject | MessageObject | VoicemailObject;
}

// Call objects
export interface CallObject {
  id: string;
  createdAt: string;
  direction: CallDirection;
  status: CallStatus;
  from: PhoneNumber;
  to: PhoneNumber[];
  duration?: number;
  recording?: RecordingObject;
  userId?: string;
  phoneNumberId: string;
}

export interface PhoneNumber {
  phoneNumber: string;
  name?: string;
}

export interface RecordingObject {
  id: string;
  url: string;
  duration: number;
  createdAt: string;
}

// Message objects
export interface MessageObject {
  id: string;
  createdAt: string;
  direction: MessageDirection;
  from: PhoneNumber;
  to: PhoneNumber[];
  body: string;
  media?: MediaObject[];
  userId?: string;
  phoneNumberId: string;
}

export interface MediaObject {
  id: string;
  url: string;
  contentType: string;
  size: number;
}

// Voicemail objects
export interface VoicemailObject {
  id: string;
  createdAt: string;
  from: PhoneNumber;
  to: PhoneNumber;
  duration: number;
  transcription?: string;
  recording: RecordingObject;
  phoneNumberId: string;
}

// API Request/Response types
export interface SendMessageRequest {
  from: string;
  to: string[];
  content: string;
  mediaUrls?: string[];
}

export interface SendMessageResponse {
  id: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  createdAt: string;
}

export interface MakeCallRequest {
  from: string;
  to: string;
  maxDuration?: number;
}

export interface MakeCallResponse {
  id: string;
  callId: string;
  status: CallStatus;
  createdAt: string;
}
