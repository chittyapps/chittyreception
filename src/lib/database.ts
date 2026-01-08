// Database connection and query utilities for Neon PostgreSQL
// Connects to the shared chittyos-core database

import { neon, neonConfig } from '@neondatabase/serverless';
import type { Env } from '@/types/env';

neonConfig.fetchConnectionCache = true;

export class Database {
  private sql: ReturnType<typeof neon>;

  constructor(connectionString: string) {
    this.sql = neon(connectionString);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try {
      // @ts-ignore - Neon client accepts string queries despite type definitions
      const result = await this.sql(sql, params);
      return result as T[];
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error(`Database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  async execute(sql: string, params: any[] = []): Promise<void> {
    await this.query(sql, params);
  }

  // Transaction support
  async transaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    await this.execute('BEGIN');
    try {
      const result = await callback(this);
      await this.execute('COMMIT');
      return result;
    } catch (error) {
      await this.execute('ROLLBACK');
      throw error;
    }
  }
}

export function createDatabase(env: Env): Database {
  return new Database(env.NEON_DATABASE_URL);
}

// Query builders for ChittyReception-specific operations
export const queries = {
  // Token validation (from shared api_tokens table)
  validateToken: (tokenHash: string) => ({
    sql: `SELECT t.*, i.did as identity_did
          FROM api_tokens t
          JOIN identities i ON t.identity_id = i.id
          WHERE t.token_hash = $1
            AND t.status = 'active'
            AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
    params: [tokenHash]
  }),

  updateTokenLastUsed: (tokenHash: string) => ({
    sql: 'UPDATE api_tokens SET last_used_at = NOW() WHERE token_hash = $1',
    params: [tokenHash]
  }),

  // Call history
  createCallRecord: (identityId: string, callId: string, direction: 'inbound' | 'outbound', from: string, to: string, metadata: any) => ({
    sql: `INSERT INTO reception_calls (identity_id, call_id, direction, from_number, to_number, metadata, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'initiated')
          RETURNING *`,
    params: [identityId, callId, direction, from, to, JSON.stringify(metadata)]
  }),

  updateCallStatus: (callId: string, status: string, endedAt?: Date) => ({
    sql: `UPDATE reception_calls
          SET status = $1, ended_at = $2, updated_at = NOW()
          WHERE call_id = $3`,
    params: [status, endedAt || null, callId]
  }),

  getCallHistory: (identityId: string, limit: number = 50, offset: number = 0) => ({
    sql: `SELECT * FROM reception_calls
          WHERE identity_id = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
    params: [identityId, limit, offset]
  }),

  // Message history
  createMessageRecord: (identityId: string, messageId: string, direction: 'inbound' | 'outbound', from: string, to: string, body: string, metadata: any) => ({
    sql: `INSERT INTO reception_messages (identity_id, message_id, direction, from_number, to_number, body, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
    params: [identityId, messageId, direction, from, to, body, JSON.stringify(metadata)]
  }),

  getMessageHistory: (identityId: string, limit: number = 50, offset: number = 0) => ({
    sql: `SELECT * FROM reception_messages
          WHERE identity_id = $1
          ORDER BY created_at DESC
          LIMIT $2 OFFSET $3`,
    params: [identityId, limit, offset]
  }),

  // Caller identity resolution (lookup by phone number)
  findIdentityByPhone: (phoneNumber: string) => ({
    sql: `SELECT i.*, p.phone_number
          FROM identities i
          JOIN identity_phones p ON i.id = p.identity_id
          WHERE p.phone_number = $1 AND p.verified = true`,
    params: [phoneNumber]
  }),

  // Audit logging
  createAuditLog: (identityId: string | null, action: string, resourceType: string, resourceId: string, details: any, ipAddress?: string, userAgent?: string) => ({
    sql: `INSERT INTO audit_logs (identity_id, action, resource_type, resource_id, details, ip_address, user_agent)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *`,
    params: [identityId, action, resourceType, resourceId, JSON.stringify(details), ipAddress || null, userAgent || null]
  }),
};
