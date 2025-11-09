// ChittyReception - Answering and orchestration service
// OpenPhone integration with AI-powered call/SMS routing

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { Env, HonoVariables } from '@/types/env';

import api from '@/routes/api';
import webhooks from '@/routes/webhooks';
import mcp from '@/routes/mcp';
import sona from '@/routes/sona';

const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Routes
app.route('/api/v1', api);
app.route('/webhooks', webhooks);
app.route('/mcp', mcp);
app.route('/sona', sona);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    service: 'chittyreception',
    version: '1.0.0',
    description: 'ChittyOS answering and orchestration service',
    endpoints: {
      health: '/api/v1/health',
      status: '/api/v1/status',
      sendMessage: 'POST /api/v1/send-message',
      makeCall: 'POST /api/v1/make-call',
      webhooks: 'POST /webhooks/openphone',
    },
    documentation: 'https://docs.chitty.cc/reception',
  });
});

// Durable Object for call state management
export class CallState {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      return new Response('Missing callId', { status: 400 });
    }

    switch (request.method) {
      case 'GET':
        const state = await this.state.storage.get(callId);
        return Response.json({ callId, state });

      case 'POST':
        const data = await request.json();
        await this.state.storage.put(callId, data);
        return Response.json({ success: true, callId });

      case 'DELETE':
        await this.state.storage.delete(callId);
        return Response.json({ success: true, callId });

      default:
        return new Response('Method not allowed', { status: 405 });
    }
  }
}

export default app;
