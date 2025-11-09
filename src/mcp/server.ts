// MCP Server for ChittyReception
// Provides Claude Code tools for phone/SMS operations

import type { Env } from '@/types/env';
import { OpenPhoneClient } from '@/lib/openphone';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export const tools: MCPTool[] = [
  {
    name: 'send_sms',
    description: 'Send an SMS message via OpenPhone',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Sender phone number (E.164 format)',
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
    description: 'Make an outbound call via OpenPhone',
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
    description: 'Get recent call history from KV storage',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of calls to retrieve (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_message_history',
    description: 'Get recent message history from KV storage',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of messages to retrieve (default: 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_call_details',
    description: 'Get details for a specific call',
    inputSchema: {
      type: 'object',
      properties: {
        callId: {
          type: 'string',
          description: 'OpenPhone call ID',
        },
      },
      required: ['callId'],
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

  switch (toolName) {
    case 'send_sms':
      return await client.sendMessage({
        from: args.from,
        to: args.to,
        content: args.content,
      });

    case 'make_call':
      return await client.makeCall({
        from: args.from,
        to: args.to,
        maxDuration: args.maxDuration,
      });

    case 'get_call_history': {
      const limit = args.limit || 10;
      // TODO: Implement proper KV listing with pagination
      // This is a simplified version
      return {
        calls: [],
        total: 0,
        message: 'Call history retrieval - implement KV list functionality',
      };
    }

    case 'get_message_history': {
      const limit = args.limit || 10;
      // TODO: Implement proper KV listing with pagination
      return {
        messages: [],
        total: 0,
        message: 'Message history retrieval - implement KV list functionality',
      };
    }

    case 'get_call_details': {
      const callData = await env.RECEPTION_KV.get(`call:${args.callId}`, 'json');
      if (!callData) {
        throw new Error(`Call not found: ${args.callId}`);
      }
      return callData;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
