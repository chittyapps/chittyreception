// MCP Server for ChittyReception
// Provides Claude Code tools for phone/SMS operations

import type { Env } from '@/types/env';
import { OpenPhoneClient } from '@/lib/openphone';
import { createDatabase } from '@/lib/database';
import { neon } from '@neondatabase/serverless';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const tools: MCPTool[] = [
  {
    name: 'send_sms',
    description: 'Send an SMS message via OpenPhone. Use this to send text messages to guests, property owners, or service providers.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Sender phone number (E.164 format, e.g., +15551234567)',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient phone numbers (E.164 format)',
        },
        content: {
          type: 'string',
          description: 'Message content',
        },
      },
      required: ['from', 'to', 'content'],
    },
  },
  {
    name: 'make_call',
    description: 'Make an outbound call via OpenPhone. Use for urgent matters or complex booking inquiries.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Caller phone number (E.164 format)',
        },
        to: {
          type: 'string',
          description: 'Recipient phone number (E.164 format)',
        },
        maxDuration: {
          type: 'number',
          description: 'Maximum call duration in seconds (optional)',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_call_history',
    description: 'Get recent call history from the database. Returns detailed call records with timestamps, duration, direction, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of calls to retrieve (default: 10, max: 100)',
        },
        phoneNumber: {
          type: 'string',
          description: 'Filter by specific phone number (optional)',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound'],
          description: 'Filter by call direction (optional)',
        },
      },
    },
  },
  {
    name: 'get_message_history',
    description: 'Get recent message history from the database. Returns message content, timestamps, and direction.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve (default: 10, max: 100)',
        },
        phoneNumber: {
          type: 'string',
          description: 'Filter by specific phone number (optional)',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound'],
          description: 'Filter by message direction (optional)',
        },
      },
    },
  },
  {
    name: 'search_guest_by_phone',
    description: 'Look up guest information by phone number. Returns ChittyID, identity details, and recent interaction history.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Phone number to search (E.164 format)',
        },
      },
      required: ['phoneNumber'],
    },
  },
  {
    name: 'get_conversation_context',
    description: 'Get full conversation context for a phone number, including all recent calls and messages in chronological order.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Phone number to get context for (E.164 format)',
        },
        days: {
          type: 'number',
          description: 'Days of history to retrieve (default: 7, max: 30)',
        },
      },
      required: ['phoneNumber'],
    },
  },
];

export async function handleToolCall(
  toolName: string,
  args: any,
  env: Env
): Promise<any> {
  const client = new OpenPhoneClient({
    apiKey: env.OPENPHONE_API_KEY,
  });

  const sql = neon(env.NEON_DATABASE_URL);

  switch (toolName) {
    case 'send_sms': {
      const result = await client.sendMessage({
        from: args.from,
        to: args.to,
        content: args.content,
      });

      // Store in database for each recipient
      try {
        for (const recipient of args.to) {
          await sql`
            INSERT INTO reception_messages (
              openphone_message_id,
              from_number,
              to_number,
              content,
              direction,
              status,
              metadata
            ) VALUES (
              ${result.id || 'unknown'},
              ${args.from},
              ${recipient},
              ${args.content},
              'outbound',
              'sent',
              ${JSON.stringify({ api_response: result })}
            )
          `;
        }
      } catch (dbError) {
        console.error('Database error storing message:', dbError);
      }

      return {
        success: true,
        message: 'SMS sent successfully',
        messageId: result.id,
        recipients: args.to,
      };
    }

    case 'make_call': {
      const result = await client.makeCall({
        from: args.from,
        to: args.to,
        maxDuration: args.maxDuration,
      });

      // Store in database
      try {
        await sql`
          INSERT INTO reception_calls (
            openphone_call_id,
            from_number,
            to_number,
            direction,
            status,
            metadata
          ) VALUES (
            ${result.id || 'unknown'},
            ${args.from},
            ${args.to},
            'outbound',
            'initiated',
            ${JSON.stringify({ api_response: result, max_duration: args.maxDuration })}
          )
        `;
      } catch (dbError) {
        console.error('Database error storing call:', dbError);
      }

      return {
        success: true,
        message: 'Call initiated successfully',
        callId: result.id,
        from: args.from,
        to: args.to,
      };
    }

    case 'get_call_history': {
      const limit = Math.min(args.limit || 10, 100);
      const { phoneNumber, direction } = args;

      let conditions = ['1=1'];
      const params: any[] = [];

      if (phoneNumber) {
        conditions.push(`(from_number = $${params.length + 1} OR to_number = $${params.length + 1})`);
        params.push(phoneNumber);
      }

      if (direction) {
        conditions.push(`direction = $${params.length + 1}`);
        params.push(direction);
      }

      const query = `
        SELECT
          id,
          openphone_call_id,
          from_number,
          to_number,
          direction,
          status,
          duration_seconds,
          recording_url,
          created_at,
          updated_at,
          chitty_id
        FROM reception_calls
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const calls = await (sql as any)(query, params);

      return {
        success: true,
        calls,
        total: calls.length,
        filters: {
          phoneNumber: phoneNumber || null,
          direction: direction || null,
          limit,
        },
      };
    }

    case 'get_message_history': {
      const limit = Math.min(args.limit || 10, 100);
      const { phoneNumber, direction } = args;

      let conditions = ['1=1'];
      const params: any[] = [];

      if (phoneNumber) {
        conditions.push(`(from_number = $${params.length + 1} OR to_number = $${params.length + 1})`);
        params.push(phoneNumber);
      }

      if (direction) {
        conditions.push(`direction = $${params.length + 1}`);
        params.push(direction);
      }

      const query = `
        SELECT
          id,
          openphone_message_id,
          from_number,
          to_number,
          content,
          direction,
          status,
          media_urls,
          created_at,
          chitty_id
        FROM reception_messages
        WHERE ${conditions.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1}
      `;
      params.push(limit);

      const messages = await (sql as any)(query, params);

      return {
        success: true,
        messages,
        total: messages.length,
        filters: {
          phoneNumber: phoneNumber || null,
          direction: direction || null,
          limit,
        },
      };
    }

    case 'search_guest_by_phone': {
      const { phoneNumber } = args;

      if (!phoneNumber) {
        throw new Error('Missing required parameter: phoneNumber');
      }

      // Look up identity
      const results = await sql`
        SELECT
          ip.id,
          ip.phone_number,
          ip.identity_id,
          ip.verified,
          i.chitty_id,
          i.entity_type,
          i.metadata as identity_metadata
        FROM identity_phones ip
        LEFT JOIN identities i ON ip.identity_id = i.id
        WHERE ip.phone_number = ${phoneNumber}
        LIMIT 1
      `;

      if (results.length === 0) {
        return {
          success: true,
          found: false,
          message: 'No guest found with this phone number',
          phoneNumber,
        };
      }

      const guest = results[0];

      // Get recent interactions
      const recentCalls = await sql`
        SELECT id, direction, status, created_at
        FROM reception_calls
        WHERE from_number = ${phoneNumber} OR to_number = ${phoneNumber}
        ORDER BY created_at DESC
        LIMIT 5
      `;

      const recentMessages = await sql`
        SELECT id, direction, content, created_at
        FROM reception_messages
        WHERE from_number = ${phoneNumber} OR to_number = ${phoneNumber}
        ORDER BY created_at DESC
        LIMIT 5
      `;

      return {
        success: true,
        found: true,
        guest: {
          chittyId: guest.chitty_id,
          entityType: guest.entity_type,
          phoneNumber: guest.phone_number,
          verified: guest.verified,
          metadata: guest.identity_metadata,
        },
        recentCalls,
        recentMessages,
      };
    }

    case 'get_conversation_context': {
      const { phoneNumber, days = 7 } = args;

      if (!phoneNumber) {
        throw new Error('Missing required parameter: phoneNumber');
      }

      const maxDays = Math.min(days, 30);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - maxDays);

      // Get calls
      const calls = await sql`
        SELECT
          id,
          'call' as type,
          from_number,
          to_number,
          direction,
          status,
          duration_seconds,
          created_at
        FROM reception_calls
        WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
          AND created_at >= ${sinceDate.toISOString()}
        ORDER BY created_at ASC
      `;

      // Get messages
      const messages = await sql`
        SELECT
          id,
          'message' as type,
          from_number,
          to_number,
          content,
          direction,
          status,
          created_at
        FROM reception_messages
        WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
          AND created_at >= ${sinceDate.toISOString()}
        ORDER BY created_at ASC
      `;

      // Merge and sort
      const allInteractions = [...calls, ...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      return {
        success: true,
        phoneNumber,
        daysOfHistory: maxDays,
        totalInteractions: allInteractions.length,
        interactions: allInteractions,
        summary: {
          totalCalls: calls.length,
          totalMessages: messages.length,
          oldestInteraction: allInteractions[0]?.created_at || null,
          latestInteraction: allInteractions[allInteractions.length - 1]?.created_at || null,
        },
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
