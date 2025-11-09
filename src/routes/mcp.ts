// MCP endpoint for Claude Code integration

import { Hono } from 'hono';
import type { Env } from '@/types/env';
import { tools, handleToolCall } from '@/mcp/server';

const mcp = new Hono<{ Bindings: Env }>();

/**
 * MCP protocol endpoint
 * Implements Model Context Protocol for Claude integration
 */
mcp.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { method, params } = body;

    switch (method) {
      case 'tools/list':
        return c.json({
          tools,
        });

      case 'tools/call': {
        const { name, arguments: args } = params;
        const result = await handleToolCall(name, args, c.env);

        return c.json({
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        });
      }

      case 'initialize':
        return c.json({
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'chittyreception',
            version: '1.0.0',
          },
        });

      default:
        return c.json(
          { error: `Unknown method: ${method}` },
          400
        );
    }
  } catch (error) {
    console.error('MCP error:', error);
    return c.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * MCP tools list endpoint (REST-style access)
 */
mcp.get('/tools', (c) => {
  return c.json({
    success: true,
    tools,
  });
});

export default mcp;
