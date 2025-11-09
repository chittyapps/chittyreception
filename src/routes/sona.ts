// Sona AI endpoint - handles conversational interface

import { Hono } from 'hono';
import type { Env } from '@/types/env';
import { orchestrateResponse, type ConversationContext } from '@/lib/ai-orchestrator';

const sona = new Hono<{ Bindings: Env }>();

/**
 * Sona conversation endpoint
 * Handles SMS and voice transcriptions
 */
sona.post('/chat', async (c) => {
  try {
    const body = await c.req.json<{
      message: string;
      context?: ConversationContext;
      sessionId?: string;
    }>();

    // Load context from KV if session exists
    let context = body.context || {};
    if (body.sessionId) {
      const savedContext = await c.env.RECEPTION_KV.get(
        `session:${body.sessionId}`,
        'json'
      );
      if (savedContext) {
        context = savedContext as ConversationContext;
      }
    }

    // Get AI response
    const response = await orchestrateResponse(body.message, context, c.env);

    // Update conversation history
    if (!context.conversationHistory) {
      context.conversationHistory = [];
    }
    context.conversationHistory.push(
      { role: 'user', content: body.message },
      { role: 'assistant', content: response.message }
    );

    // Save updated context
    if (body.sessionId) {
      await c.env.RECEPTION_KV.put(
        `session:${body.sessionId}`,
        JSON.stringify(context),
        { expirationTtl: 3600 } // 1 hour session
      );
    }

    return c.json({
      success: true,
      data: {
        message: response.message,
        intent: response.intent,
        action: response.action,
        transferNumber: response.transferNumber,
        nextStep: response.nextStep,
      },
    });
  } catch (error) {
    console.error('Sona chat error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'CHAT_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      500
    );
  }
});

/**
 * Test Sona conversation (for development)
 */
sona.get('/test', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sona Test Interface</title>
      <style>
        body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
        .chat { border: 1px solid #ddd; padding: 20px; height: 400px; overflow-y: auto; margin-bottom: 20px; }
        .message { margin: 10px 0; padding: 10px; border-radius: 5px; }
        .user { background: #e3f2fd; text-align: right; }
        .assistant { background: #f5f5f5; }
        input { width: 100%; padding: 10px; font-size: 16px; }
      </style>
    </head>
    <body>
      <h1>Sona Test Interface</h1>
      <div class="chat" id="chat"></div>
      <input type="text" id="input" placeholder="Type your message..." />

      <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('input');
        const sessionId = 'test-' + Date.now();

        input.addEventListener('keypress', async (e) => {
          if (e.key === 'Enter' && input.value.trim()) {
            const message = input.value.trim();
            input.value = '';

            // Display user message
            chat.innerHTML += '<div class="message user"><strong>You:</strong> ' + message + '</div>';
            chat.scrollTop = chat.scrollHeight;

            // Send to Sona
            const response = await fetch('/sona/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, sessionId })
            });

            const data = await response.json();

            // Display Sona response
            chat.innerHTML += '<div class="message assistant"><strong>Sona:</strong> ' +
              data.data.message.replace(/\\n/g, '<br>') +
              (data.data.intent ? '<br><em>Intent: ' + data.data.intent + '</em>' : '') +
              '</div>';
            chat.scrollTop = chat.scrollHeight;
          }
        });

        // Initial greeting
        chat.innerHTML = '<div class="message assistant"><strong>Sona:</strong> Thanks for calling Chicago Furnished Condos. I\'m Sona, the virtual concierge. This call is recorded for quality and training.<br><br>Are you calling about booking a stay, an existing reservation, corporate housing, maintenance, or something else?</div>';
      </script>
    </body>
    </html>
  `);
});

export default sona;
