#!/usr/bin/env node
/**
 * ChittyReception MCP Server
 * Standalone Model Context Protocol server for Claude Desktop integration
 *
 * Transport: stdio (standard input/output)
 * Protocol: MCP 2024-11-05
 *
 * Configuration for Claude Desktop:
 * {
 *   "mcpServers": {
 *     "chittyreception": {
 *       "command": "node",
 *       "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
 *       "env": {
 *         "OPENPHONE_API_KEY": "your_openphone_api_key",
 *         "NEON_DATABASE_URL": "postgresql://...",
 *         "CHITTY_ID_SERVICE_TOKEN": "your_token",
 *         "CHITTY_AUTH_SERVICE_TOKEN": "your_token"
 *       }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { neon, neonConfig } from '@neondatabase/serverless';
import 'dotenv/config';

// Configure neon for array mode (allows parameterized queries)
neonConfig.fetchConnectionCache = true;

// Type definitions
interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

interface SendMessageRequest {
  from: string;
  to: string[];
  content: string;
}

interface MakeCallRequest {
  from: string;
  to: string;
  maxDuration?: number;
}

// OpenPhone API client
class OpenPhoneClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl = 'https://api.openphone.com/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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

  async sendMessage(request: SendMessageRequest): Promise<any> {
    return this.request('/messages', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async makeCall(request: MakeCallRequest): Promise<any> {
    return this.request('/calls', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getPhoneNumbers(): Promise<any> {
    return this.request('/phone-numbers', {
      method: 'GET',
    });
  }
}

// Environment validation
const OPENPHONE_API_KEY = process.env.OPENPHONE_API_KEY;
const NEON_DATABASE_URL = process.env.NEON_DATABASE_URL;

if (!OPENPHONE_API_KEY) {
  throw new Error('OPENPHONE_API_KEY environment variable is required');
}

if (!NEON_DATABASE_URL) {
  throw new Error('NEON_DATABASE_URL environment variable is required');
}

// Initialize clients
const openphone = new OpenPhoneClient(OPENPHONE_API_KEY);
const sql = neon(NEON_DATABASE_URL);

// MCP Tool definitions
const tools: MCPTool[] = [
  {
    name: 'send_sms',
    description: 'Send an SMS message via OpenPhone. Use this to send text messages to guests, property owners, or service providers. Ideal for booking confirmations, check-in instructions, or quick updates.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Sender phone number in E.164 format (e.g., +15551234567). Must be a valid OpenPhone number.',
        },
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of recipient phone numbers in E.164 format. Can send to multiple recipients.',
        },
        content: {
          type: 'string',
          description: 'The message content to send. Keep professional and concise.',
        },
      },
      required: ['from', 'to', 'content'],
    },
  },
  {
    name: 'make_call',
    description: 'Initiate an outbound call via OpenPhone. Use this for urgent matters, complex booking inquiries, or when SMS is insufficient. The call will be routed through OpenPhone\'s system.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Caller phone number in E.164 format (e.g., +15551234567). Must be a valid OpenPhone number.',
        },
        to: {
          type: 'string',
          description: 'Recipient phone number in E.164 format.',
        },
        maxDuration: {
          type: 'number',
          description: 'Maximum call duration in seconds (optional). Helps control costs.',
        },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'get_call_history',
    description: 'Retrieve recent call history from the database. Returns detailed call records including timestamps, duration, direction (inbound/outbound), status, and linked ChittyIDs. Useful for reviewing guest interactions and tracking booking inquiries.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of calls to retrieve (default: 10, max: 100).',
        },
        phoneNumber: {
          type: 'string',
          description: 'Filter by specific phone number (optional, E.164 format).',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound'],
          description: 'Filter by call direction (optional).',
        },
      },
    },
  },
  {
    name: 'get_message_history',
    description: 'Retrieve recent SMS message history from the database. Returns message content, timestamps, direction (inbound/outbound), and associated phone numbers. Essential for tracking guest communications and booking conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to retrieve (default: 10, max: 100).',
        },
        phoneNumber: {
          type: 'string',
          description: 'Filter by specific phone number (optional, E.164 format).',
        },
        direction: {
          type: 'string',
          enum: ['inbound', 'outbound'],
          description: 'Filter by message direction (optional).',
        },
      },
    },
  },
  {
    name: 'search_guest_by_phone',
    description: 'Look up guest information and booking history by phone number. Returns the ChittyID, identity details, and associated case information. Use this to identify callers and access their booking history.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Phone number to search in E.164 format (e.g., +15551234567).',
        },
      },
      required: ['phoneNumber'],
    },
  },
  {
    name: 'get_available_phone_numbers',
    description: 'List all OpenPhone numbers available for sending messages or making calls. Returns phone numbers with their labels and capabilities. Use this to see which numbers can be used as the "from" parameter.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_conversation_context',
    description: 'Retrieve the full conversation context for a phone number, including recent calls and messages in chronological order. Provides complete interaction history for better context in guest communications.',
    inputSchema: {
      type: 'object',
      properties: {
        phoneNumber: {
          type: 'string',
          description: 'Phone number to get conversation context for (E.164 format).',
        },
        days: {
          type: 'number',
          description: 'Number of days of history to retrieve (default: 7, max: 30).',
        },
      },
      required: ['phoneNumber'],
    },
  },
];

// Tool handlers
async function handleSendSMS(args: any): Promise<any> {
  const { from, to, content } = args;

  // Validate inputs
  if (!from || !to || !content) {
    throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: from, to, content');
  }

  if (!Array.isArray(to) || to.length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Parameter "to" must be a non-empty array');
  }

  // Send message via OpenPhone
  const result = await openphone.sendMessage({ from, to, content });

  // Store in database
  try {
    for (const recipient of to) {
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
          ${from},
          ${recipient},
          ${content},
          'outbound',
          'sent',
          ${JSON.stringify({ api_response: result })}
        )
      `;
    }
  } catch (dbError) {
    console.error('Database insertion error:', dbError);
    // Don't fail the operation if DB insert fails
  }

  return {
    success: true,
    message: 'SMS sent successfully',
    messageId: result.id,
    recipients: to,
    content,
  };
}

async function handleMakeCall(args: any): Promise<any> {
  const { from, to, maxDuration } = args;

  // Validate inputs
  if (!from || !to) {
    throw new McpError(ErrorCode.InvalidParams, 'Missing required parameters: from, to');
  }

  // Make call via OpenPhone
  const result = await openphone.makeCall({ from, to, maxDuration });

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
        ${from},
        ${to},
        'outbound',
        'initiated',
        ${JSON.stringify({ api_response: result, max_duration: maxDuration })}
      )
    `;
  } catch (dbError) {
    console.error('Database insertion error:', dbError);
  }

  return {
    success: true,
    message: 'Call initiated successfully',
    callId: result.id,
    from,
    to,
  };
}

async function handleGetCallHistory(args: any): Promise<any> {
  const limit = Math.min(args.limit || 10, 100);
  const { phoneNumber, direction } = args;

  // Build query with filters using template strings
  let calls;

  if (phoneNumber && direction) {
    calls = await sql`
      SELECT * FROM reception_calls
      WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
        AND direction = ${direction}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (phoneNumber) {
    calls = await sql`
      SELECT * FROM reception_calls
      WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (direction) {
    calls = await sql`
      SELECT * FROM reception_calls
      WHERE direction = ${direction}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else {
    calls = await sql`
      SELECT * FROM reception_calls
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

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

async function handleGetMessageHistory(args: any): Promise<any> {
  const limit = Math.min(args.limit || 10, 100);
  const { phoneNumber, direction } = args;

  // Build query with filters using template strings
  let messages;

  if (phoneNumber && direction) {
    messages = await sql`
      SELECT * FROM reception_messages
      WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
        AND direction = ${direction}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (phoneNumber) {
    messages = await sql`
      SELECT * FROM reception_messages
      WHERE (from_number = ${phoneNumber} OR to_number = ${phoneNumber})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else if (direction) {
    messages = await sql`
      SELECT * FROM reception_messages
      WHERE direction = ${direction}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  } else {
    messages = await sql`
      SELECT * FROM reception_messages
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

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

async function handleSearchGuestByPhone(args: any): Promise<any> {
  const { phoneNumber } = args;

  if (!phoneNumber) {
    throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: phoneNumber');
  }

  // Look up in identity_phones table
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

  // Get recent interaction history
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

async function handleGetAvailablePhoneNumbers(): Promise<any> {
  const phoneNumbers = await openphone.getPhoneNumbers();

  return {
    success: true,
    phoneNumbers: phoneNumbers.data || phoneNumbers,
    message: 'Available OpenPhone numbers for outbound communication',
  };
}

async function handleGetConversationContext(args: any): Promise<any> {
  const { phoneNumber, days = 7 } = args;

  if (!phoneNumber) {
    throw new McpError(ErrorCode.InvalidParams, 'Missing required parameter: phoneNumber');
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

  // Merge and sort chronologically
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

// Main tool call handler
async function handleToolCall(name: string, args: any): Promise<any> {
  console.error(`[MCP] Tool called: ${name}`, JSON.stringify(args, null, 2));

  try {
    switch (name) {
      case 'send_sms':
        return await handleSendSMS(args);

      case 'make_call':
        return await handleMakeCall(args);

      case 'get_call_history':
        return await handleGetCallHistory(args);

      case 'get_message_history':
        return await handleGetMessageHistory(args);

      case 'search_guest_by_phone':
        return await handleSearchGuestByPhone(args);

      case 'get_available_phone_numbers':
        return await handleGetAvailablePhoneNumbers();

      case 'get_conversation_context':
        return await handleGetConversationContext(args);

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`[MCP] Tool error for ${name}:`, error);

    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Create and run MCP server
const server = new Server(
  {
    name: 'chittyreception',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error('[MCP] Tools listed');
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[MCP] Executing tool: ${name}`);

  const result = await handleToolCall(name, args || {});

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] ChittyReception MCP Server running on stdio');
  console.error('[MCP] Available tools:', tools.map(t => t.name).join(', '));
}

main().catch((error) => {
  console.error('[MCP] Fatal error:', error);
  process.exit(1);
});
