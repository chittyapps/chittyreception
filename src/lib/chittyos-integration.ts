// ChittyOS Service Integration
// Service-to-service communication with ChittyID, ChittyAuth, ChittyRouter, etc.

import type { Env } from '@/types/env';

// Service URLs
const CHITTYID_SERVICE = 'https://id.chitty.cc';
const CHITTYAUTH_SERVICE = 'https://auth.chitty.cc';
const CHITTYCONNECT_SERVICE = 'https://connect.chitty.cc';
const CHITTYROUTER_SERVICE = 'https://router.chitty.cc';
const CHITTYVERIFY_SERVICE = 'https://verify.chitty.cc';
const CHITTYTRUST_SERVICE = 'https://trust.chitty.cc';
const CHITTYCHRONICLE_SERVICE = 'https://chronicle.chitty.cc';

/**
 * ChittyID Integration
 * Mint new identities and resolve caller identities
 */
export class ChittyIDClient {
  constructor(private env: Env) {}

  /**
   * Mint a new ChittyID for a caller
   */
  async mintIdentity(entityType: 'PERSON' | 'ORGANIZATION', metadata?: any): Promise<{
    success: boolean;
    data?: {
      did: string;
      id: string;
    };
    error?: any;
  }> {
    try {
      const response = await fetch(`${CHITTYID_SERVICE}/api/v2/chittyid/mint`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_ID_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Service-Name': 'ChittyReception',
          'X-Service-Action': 'identity-creation',
        },
        body: JSON.stringify({
          entity: entityType,
          metadata,
        }),
      });

      const result = await response.json() as any;
      return result;
    } catch (error) {
      console.error('ChittyID mint error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Resolve identity from phone number
   */
  async resolveIdentityByPhone(phoneNumber: string): Promise<{
    success: boolean;
    data?: {
      did: string;
      identityId: string;
    };
    error?: any;
  }> {
    try {
      // This would typically query our local database first
      // Then fall back to ChittyID service if needed
      const response = await fetch(`${CHITTYID_SERVICE}/api/v2/identity/resolve/phone/${encodeURIComponent(phoneNumber)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_ID_SERVICE_TOKEN}`,
          'X-Service-Name': 'ChittyReception',
        },
      });

      const result = await response.json() as any;
      return result;
    } catch (error) {
      console.error('ChittyID resolve error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * ChittyRouter Integration
 * AI-powered routing and orchestration
 */
export class ChittyRouterClient {
  constructor(private env: Env) {}

  /**
   * Route an inbound call through AI triage
   */
  async routeCall(callData: {
    callId: string;
    from: string;
    to: string;
    callerIdentity?: string;
    transcript?: string;
  }): Promise<{
    success: boolean;
    data?: {
      action: 'answer' | 'route' | 'voicemail' | 'block';
      destination?: string;
      priority: 'urgent' | 'high' | 'normal' | 'low';
      aiAnalysis: string;
    };
    error?: any;
  }> {
    try {
      const response = await fetch(`${CHITTYROUTER_SERVICE}/api/v1/route/call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_CONNECT_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Service-Name': 'ChittyReception',
        },
        body: JSON.stringify(callData),
      });

      if (!response.ok) {
        throw new Error(`ChittyRouter returned ${response.status}`);
      }

      const result = await response.json() as any;
      return result;
    } catch (error) {
      console.error('ChittyRouter route error:', error);
      // Fallback to default routing
      return {
        success: true,
        data: {
          action: 'answer',
          priority: 'normal',
          aiAnalysis: 'Fallback routing - ChittyRouter unavailable',
        },
      };
    }
  }

  /**
   * Process inbound message through AI analysis
   */
  async processMessage(messageData: {
    messageId: string;
    from: string;
    to: string;
    body: string;
    callerIdentity?: string;
  }): Promise<{
    success: boolean;
    data?: {
      intent: string;
      sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
      suggestedResponse: string;
      requiresHuman: boolean;
      priority: number;
    };
    error?: any;
  }> {
    try {
      const response = await fetch(`${CHITTYROUTER_SERVICE}/api/v1/analyze/message`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_CONNECT_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Service-Name': 'ChittyReception',
        },
        body: JSON.stringify(messageData),
      });

      if (!response.ok) {
        throw new Error(`ChittyRouter returned ${response.status}`);
      }

      const result = await response.json() as any;
      return result;
    } catch (error) {
      console.error('ChittyRouter message analysis error:', error);
      // Fallback to basic processing
      return {
        success: true,
        data: {
          intent: 'general_inquiry',
          sentiment: 'neutral',
          suggestedResponse: 'Thank you for your message. Our team will respond shortly.',
          requiresHuman: true,
          priority: 5,
        },
      };
    }
  }
}

/**
 * ChittyTrust Integration
 * Trust scoring for callers
 */
export class ChittyTrustClient {
  constructor(private env: Env) {}

  /**
   * Get trust score for an identity
   */
  async getTrustScore(identityId: string): Promise<{
    success: boolean;
    data?: {
      trustScore: number; // 0-100
      riskLevel: 'low' | 'medium' | 'high';
      factors: string[];
    };
    error?: any;
  }> {
    try {
      const response = await fetch(`${CHITTYTRUST_SERVICE}/api/v1/trust-score/${identityId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_CONNECT_SERVICE_TOKEN}`,
          'X-Service-Name': 'ChittyReception',
        },
      });

      const result = await response.json() as any;
      return result;
    } catch (error) {
      console.error('ChittyTrust error:', error);
      // Default to neutral trust
      return {
        success: true,
        data: {
          trustScore: 50,
          riskLevel: 'medium',
          factors: ['No history available'],
        },
      };
    }
  }
}

/**
 * ChittyChronicle Integration
 * System-wide audit logging
 */
export class ChittyChronicleClient {
  constructor(private env: Env) {}

  /**
   * Log an event to ChittyChronicle
   */
  async logEvent(event: {
    service: string;
    action: string;
    identityId?: string;
    resourceType: string;
    resourceId: string;
    details: any;
    severity?: 'info' | 'warning' | 'error' | 'critical';
  }): Promise<void> {
    try {
      // Fire and forget - don't block on audit logging
      fetch(`${CHITTYCHRONICLE_SERVICE}/api/v1/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.env.CHITTY_CONNECT_SERVICE_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Service-Name': 'ChittyReception',
        },
        body: JSON.stringify({
          ...event,
          timestamp: new Date().toISOString(),
          service: 'chittyreception',
        }),
      }).catch((err) => {
        console.error('ChittyChronicle logging failed:', err);
      });
    } catch (error) {
      // Swallow errors - audit logging is best-effort
      console.error('ChittyChronicle error:', error);
    }
  }
}

/**
 * Unified ChittyOS client
 * Provides access to all ChittyOS services
 */
export class ChittyOSClient {
  public id: ChittyIDClient;
  public router: ChittyRouterClient;
  public trust: ChittyTrustClient;
  public chronicle: ChittyChronicleClient;

  constructor(env: Env) {
    this.id = new ChittyIDClient(env);
    this.router = new ChittyRouterClient(env);
    this.trust = new ChittyTrustClient(env);
    this.chronicle = new ChittyChronicleClient(env);
  }

  /**
   * Convenience method: Full caller resolution pipeline
   * 1. Resolve identity by phone
   * 2. Get trust score
   * 3. Log lookup event
   */
  async resolveCallerFull(phoneNumber: string, callContext?: any): Promise<{
    identity?: {
      did: string;
      identityId: string;
    };
    trustScore?: {
      score: number;
      riskLevel: 'low' | 'medium' | 'high';
    };
  }> {
    const result: any = {};

    // Resolve identity
    const identityResult = await this.id.resolveIdentityByPhone(phoneNumber);
    if (identityResult.success && identityResult.data) {
      result.identity = identityResult.data;

      // Get trust score
      const trustResult = await this.trust.getTrustScore(identityResult.data.identityId);
      if (trustResult.success && trustResult.data) {
        result.trustScore = {
          score: trustResult.data.trustScore,
          riskLevel: trustResult.data.riskLevel,
        };
      }

      // Log the lookup
      await this.chronicle.logEvent({
        service: 'chittyreception',
        action: 'caller.resolved',
        identityId: identityResult.data.identityId,
        resourceType: 'phone_lookup',
        resourceId: phoneNumber,
        details: {
          phoneNumber,
          trustScore: result.trustScore,
          context: callContext,
        },
      });
    }

    return result;
  }
}
