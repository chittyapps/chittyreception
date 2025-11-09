// OpenPhone API client

import type {
  OpenPhoneConfig,
  SendMessageRequest,
  SendMessageResponse,
  MakeCallRequest,
  MakeCallResponse,
} from '@/types/openphone';

export class OpenPhoneClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: OpenPhoneConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openphone.com/v1';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenPhone API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Send an SMS message
   */
  async sendMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>('/messages', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Make an outbound call
   */
  async makeCall(request: MakeCallRequest): Promise<MakeCallResponse> {
    return this.request<MakeCallResponse>('/calls', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  /**
   * Get call details
   */
  async getCall(callId: string) {
    return this.request(`/calls/${callId}`, {
      method: 'GET',
    });
  }

  /**
   * Get message details
   */
  async getMessage(messageId: string) {
    return this.request(`/messages/${messageId}`, {
      method: 'GET',
    });
  }

  /**
   * Get phone numbers
   */
  async getPhoneNumbers() {
    return this.request('/phone-numbers', {
      method: 'GET',
    });
  }
}

/**
 * Verify OpenPhone webhook signature
 */
export async function verifyOpenPhoneWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // OpenPhone uses HMAC-SHA256 for webhook signatures
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return signature === expectedSignature;
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}
