// Authentication middleware for ChittyReception
// Validates tokens against the shared chittyos-core database

import { Context, Next } from 'hono';
import type { Env, HonoVariables, AuthContext } from '@/types/env';
import { createDatabase, queries } from '@/lib/database';
import { createHash } from 'crypto';

/**
 * Authentication middleware that validates Bearer tokens
 * Token validation pattern:
 * 1. Extract token from Authorization header
 * 2. Hash token with SHA-256
 * 3. Look up in api_tokens table (shared database)
 * 4. Verify status='active' and not expired
 * 5. Update last_used_at timestamp
 */
export async function authenticate(c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) {
  try {
    // Extract token from Authorization header
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing or invalid Authorization header',
            details: 'Expected format: Authorization: Bearer {token}',
          },
        },
        401
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (!token) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token not provided',
          },
        },
        401
      );
    }

    // Hash the token with SHA-256 (same as stored in database)
    const tokenHash = createHash('sha256').update(token).digest('hex');

    // Validate token against database
    const db = createDatabase(c.env);
    const { sql, params } = queries.validateToken(tokenHash);
    const tokenRecord = await db.queryOne<{
      id: string;
      identity_id: string;
      identity_did: string;
      name: string;
      scopes: string[];
      status: string;
      expires_at: string | null;
    }>(sql, params);

    if (!tokenRecord) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or expired token',
          },
        },
        401
      );
    }

    // Update last_used_at timestamp (fire and forget)
    const updateQuery = queries.updateTokenLastUsed(tokenHash);
    db.execute(updateQuery.sql, updateQuery.params).catch((err) => {
      console.error('Failed to update token last_used_at:', err);
    });

    // Store auth context for downstream handlers
    c.set('auth', {
      identityId: tokenRecord.identity_id,
      identityDid: tokenRecord.identity_did,
      tokenScopes: tokenRecord.scopes,
      tokenName: tokenRecord.name,
    } as AuthContext);

    await next();
  } catch (error) {
    console.error('Authentication error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Failed to authenticate request',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
}

/**
 * Optional authentication middleware
 * Validates token if provided, but allows unauthenticated requests
 */
export async function optionalAuthenticate(c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    // If token is provided, validate it
    return authenticate(c, next);
  }

  // No token provided, continue without auth context
  await next();
}

/**
 * Scope checking middleware
 * Verifies the authenticated user has required scope
 */
export function requireScope(scope: string) {
  return async (c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        },
        401
      );
    }

    if (!auth.tokenScopes.includes(scope)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Missing required scope: ${scope}`,
            details: `Your token has scopes: ${auth.tokenScopes.join(', ')}`,
          },
        },
        403
      );
    }

    await next();
  };
}

/**
 * Service-to-service authentication
 * Validates that the request comes from another ChittyOS service
 */
export async function authenticateService(c: Context<{ Bindings: Env; Variables: HonoVariables }>, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');
    const serviceName = c.req.header('X-Service-Name');

    if (!authHeader || !serviceName) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Service authentication required',
            details: 'Missing Authorization header or X-Service-Name',
          },
        },
        401
      );
    }

    const token = authHeader.substring(7);

    // Verify service token matches expected token for the service
    const expectedToken = getServiceToken(c.env, serviceName);
    if (token !== expectedToken) {
      return c.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid service token',
          },
        },
        401
      );
    }

    c.set('serviceName', serviceName);
    await next();
  } catch (error) {
    console.error('Service authentication error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'AUTHENTICATION_ERROR',
          message: 'Service authentication failed',
        },
      },
      500
    );
  }
}

/**
 * Get the expected service token for a given service name
 */
function getServiceToken(env: Env, serviceName: string): string | null {
  const serviceTokenMap: Record<string, keyof Env> = {
    'ChittyID': 'CHITTY_ID_SERVICE_TOKEN',
    'ChittyAuth': 'CHITTY_AUTH_SERVICE_TOKEN',
    'ChittyConnect': 'CHITTY_CONNECT_SERVICE_TOKEN',
  };

  const tokenKey = serviceTokenMap[serviceName];
  return tokenKey ? env[tokenKey] as string : null;
}
