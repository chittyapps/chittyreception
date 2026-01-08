// Environment and bindings types for Cloudflare Workers

export interface Env {
  // OpenPhone API credentials
  OPENPHONE_API_KEY: string;
  OPENPHONE_WEBHOOK_SECRET: string;

  // Twilio credentials (for future migration)
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_WEBHOOK_SECRET?: string;

  // ChittyOS service tokens
  CHITTY_ID_SERVICE_TOKEN: string;
  CHITTY_AUTH_SERVICE_TOKEN: string;
  CHITTY_CONNECT_SERVICE_TOKEN: string;

  // Database
  NEON_DATABASE_URL: string;

  // JWT and encryption
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;

  // Environment
  ENVIRONMENT: 'development' | 'staging' | 'production';

  // Cloudflare bindings
  AI: Ai;
  RECEPTION_KV: KVNamespace;
  CALL_STATE: DurableObjectNamespace;
}

// Hono context variables
export interface HonoVariables {
  auth: AuthContext;
  serviceName: string;
}

export interface AuthContext {
  identityId: string;
  identityDid: string;
  tokenScopes: string[];
  tokenName: string;
}

export interface OpenPhoneWebhookContext {
  verified: boolean;
  event: import('./openphone').OpenPhoneWebhookEvent;
}
