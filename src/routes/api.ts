// API routes for chittyreception

import { Hono } from 'hono';
import type { Env, HonoVariables } from '@/types/env';
import { OpenPhoneClient } from '@/lib/openphone';
import type { SendMessageRequest, MakeCallRequest } from '@/types/openphone';
import { authenticate } from '@/lib/auth';
import { createDatabase, queries } from '@/lib/database';

const api = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * Health check endpoint
 */
api.get('/health', (c) => {
  return c.json({
    success: true,
    service: 'chittyreception',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Send SMS via OpenPhone
 * Requires authentication
 */
api.post('/send-message', authenticate, async (c) => {
  try {
    const auth = c.get('auth');
    const body = await c.req.json<SendMessageRequest>();

    const client = new OpenPhoneClient({
      apiKey: c.env.OPENPHONE_API_KEY,
    });

    const result = await client.sendMessage(body);

    // Log message to database
    const db = createDatabase(c.env);
    const messageQuery = queries.createMessageRecord(
      auth.identityId,
      result.id,
      'outbound',
      body.from,
      body.to.join(','),
      body.content,
      { result }
    );
    await db.execute(messageQuery.sql, messageQuery.params);

    // Audit log
    const auditQuery = queries.createAuditLog(
      auth.identityId,
      'message.sent',
      'message',
      result.id,
      { from: body.from, to: body.to }
    );
    await db.execute(auditQuery.sql, auditQuery.params);

    return c.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Send message error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'SEND_MESSAGE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * Make outbound call via OpenPhone
 * Requires authentication
 */
api.post('/make-call', authenticate, async (c) => {
  try {
    const auth = c.get('auth') ;
    const body = await c.req.json<MakeCallRequest>();

    const client = new OpenPhoneClient({
      apiKey: c.env.OPENPHONE_API_KEY,
    });

    const result = await client.makeCall(body);

    // Log call to database
    const db = createDatabase(c.env);
    const callQuery = queries.createCallRecord(
      auth.identityId,
      result.callId,
      'outbound',
      body.from,
      body.to,
      { result }
    );
    await db.execute(callQuery.sql, callQuery.params);

    // Audit log
    const auditQuery = queries.createAuditLog(
      auth.identityId,
      'call.initiated',
      'call',
      result.callId,
      { from: body.from, to: body.to }
    );
    await db.execute(auditQuery.sql, auditQuery.params);

    return c.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Make call error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'MAKE_CALL_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * Get call history from database
 * Requires authentication
 */
api.get('/calls', authenticate, async (c) => {
  try {
    const auth = c.get('auth') ;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const db = createDatabase(c.env);
    const query = queries.getCallHistory(auth.identityId, limit, offset);
    const calls = await db.query(query.sql, query.params);

    return c.json({
      success: true,
      data: calls,
      metadata: {
        timestamp: new Date().toISOString(),
        limit,
        offset,
        count: calls.length,
      },
    });
  } catch (error) {
    console.error('Get calls error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'GET_CALLS_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * Get message history from database
 * Requires authentication
 */
api.get('/messages', authenticate, async (c) => {
  try {
    const auth = c.get('auth') ;
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    const db = createDatabase(c.env);
    const query = queries.getMessageHistory(auth.identityId, limit, offset);
    const messages = await db.query(query.sql, query.params);

    return c.json({
      success: true,
      data: messages,
      metadata: {
        timestamp: new Date().toISOString(),
        limit,
        offset,
        count: messages.length,
      },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'GET_MESSAGES_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

export default api;
