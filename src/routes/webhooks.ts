// OpenPhone webhook handlers

import { Hono } from 'hono';
import type { Env } from '@/types/env';
import type { OpenPhoneWebhookEvent } from '@/types/openphone';
import { verifyOpenPhoneWebhook } from '@/lib/openphone';
import { ChittyOSClient } from '@/lib/chittyos-integration';
import { createDatabase, queries } from '@/lib/database';

const webhooks = new Hono<{ Bindings: Env }>();

/**
 * OpenPhone webhook endpoint
 * Receives events for calls, messages, and voicemails
 */
webhooks.post('/openphone', async (c) => {
  try {
    // Get webhook signature from headers
    const signature = c.req.header('x-openphone-signature');
    if (!signature) {
      return c.json({ error: 'Missing webhook signature' }, 401);
    }

    // Get raw body for signature verification
    const rawBody = await c.req.text();

    // Verify webhook signature
    const isValid = await verifyOpenPhoneWebhook(
      rawBody,
      signature,
      c.env.OPENPHONE_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error('Invalid webhook signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse event
    const event: OpenPhoneWebhookEvent = JSON.parse(rawBody);

    console.log('OpenPhone webhook received:', {
      type: event.type,
      id: event.id,
      createdAt: event.createdAt,
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'call.initiated':
        await handleCallInitiated(event, c.env);
        break;
      case 'call.completed':
        await handleCallCompleted(event, c.env);
        break;
      case 'message.created':
        await handleMessageCreated(event, c.env);
        break;
      case 'voicemail.created':
        await handleVoicemailCreated(event, c.env);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    return c.json({ success: true, received: event.id });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return c.json({ error: 'Webhook processing failed' }, 500);
  }
});

/**
 * Handle incoming call initiated
 * Integrates with ChittyID, ChittyRouter, and ChittyTrust
 */
async function handleCallInitiated(event: OpenPhoneWebhookEvent, env: Env) {
  const call = event.data.object as import('@/types/openphone').CallObject;
  const fromNumber = call.from.phoneNumber;
  const toNumber = call.to[0]?.phoneNumber;

  console.log('Call initiated:', {
    callId: call.id,
    from: fromNumber,
    to: toNumber,
    direction: call.direction,
  });

  // Initialize ChittyOS client
  const chittyos = new ChittyOSClient(env);
  const db = createDatabase(env);

  // Step 1: Resolve caller identity
  const callerInfo = await chittyos.resolveCallerFull(fromNumber, {
    callId: call.id,
    direction: call.direction,
  });

  let identityId: string | null = null;

  if (callerInfo.identity) {
    identityId = callerInfo.identity.identityId;
    console.log('Caller identified:', {
      did: callerInfo.identity.did,
      trustScore: callerInfo.trustScore?.score,
      riskLevel: callerInfo.trustScore?.riskLevel,
    });
  } else {
    // Unknown caller - create new identity
    console.log('Unknown caller - minting new ChittyID');
    const newIdentity = await chittyos.id.mintIdentity('PERSON', {
      phoneNumber: fromNumber,
      source: 'openphone_call',
      firstContactDate: new Date().toISOString(),
    });

    if (newIdentity.success && newIdentity.data) {
      identityId = newIdentity.data.id;

      // Link phone number to identity
      const phoneQuery = queries.createAuditLog(
        identityId,
        'identity.phone.linked',
        'phone_number',
        fromNumber,
        { phoneNumber: fromNumber, verified: false }
      );
      await db.execute(phoneQuery.sql, phoneQuery.params);
    }
  }

  // Step 2: Route call through ChittyRouter AI
  const routingDecision = await chittyos.router.routeCall({
    callId: call.id,
    from: fromNumber,
    to: toNumber,
    callerIdentity: identityId || undefined,
  });

  console.log('Call routing decision:', routingDecision.data);

  // Step 3: Store call in database
  if (identityId) {
    const callQuery = queries.createCallRecord(
      identityId,
      call.id,
      call.direction as 'inbound' | 'outbound',
      fromNumber,
      toNumber,
      {
        openphoneData: call,
        routingDecision: routingDecision.data,
        trustScore: callerInfo.trustScore,
      }
    );
    await db.execute(callQuery.sql, callQuery.params);
  }

  // Step 4: Store call state in KV for real-time access
  await env.RECEPTION_KV.put(
    `call:${call.id}`,
    JSON.stringify({
      ...call,
      receivedAt: new Date().toISOString(),
      identity: callerInfo.identity,
      trustScore: callerInfo.trustScore,
      routingDecision: routingDecision.data,
    }),
    { expirationTtl: 86400 } // 24 hours
  );

  // Step 5: Log to ChittyChronicle
  await chittyos.chronicle.logEvent({
    service: 'chittyreception',
    action: 'call.initiated',
    identityId: identityId || undefined,
    resourceType: 'call',
    resourceId: call.id,
    details: {
      from: fromNumber,
      to: toNumber,
      direction: call.direction,
      routingDecision: routingDecision.data,
    },
    severity: routingDecision.data?.priority === 'urgent' ? 'warning' : 'info',
  });
}

/**
 * Handle call completed
 */
async function handleCallCompleted(event: OpenPhoneWebhookEvent, env: Env) {
  const call = event.data.object as import('@/types/openphone').CallObject;
  console.log('Call completed:', {
    callId: call.id,
    duration: call.duration,
    status: call.status,
  });

  // Update call state
  const existingCall = await env.RECEPTION_KV.get(`call:${call.id}`, 'json');
  if (existingCall) {
    await env.RECEPTION_KV.put(
      `call:${call.id}`,
      JSON.stringify({
        ...existingCall,
        ...call,
        completedAt: new Date().toISOString(),
      }),
      { expirationTtl: 86400 }
    );
  }

  // TODO: Implement post-call processing
  // - Store recording URL
  // - Generate call summary with AI
  // - Update case in database if linked
}

/**
 * Handle incoming message
 * Integrates with ChittyRouter for AI analysis and response generation
 */
async function handleMessageCreated(event: OpenPhoneWebhookEvent, env: Env) {
  const message = event.data.object as import('@/types/openphone').MessageObject;
  const fromNumber = message.from.phoneNumber;
  const toNumber = message.to[0]?.phoneNumber;

  console.log('Message received:', {
    messageId: message.id,
    from: fromNumber,
    to: toNumber,
    body: message.body.substring(0, 50),
  });

  // Initialize ChittyOS client
  const chittyos = new ChittyOSClient(env);
  const db = createDatabase(env);

  // Step 1: Resolve sender identity
  const senderInfo = await chittyos.resolveCallerFull(fromNumber, {
    messageId: message.id,
    messagePreview: message.body.substring(0, 100),
  });

  let identityId: string | null = null;

  if (senderInfo.identity) {
    identityId = senderInfo.identity.identityId;
  } else {
    // Unknown sender - create new identity
    const newIdentity = await chittyos.id.mintIdentity('PERSON', {
      phoneNumber: fromNumber,
      source: 'openphone_message',
      firstContactDate: new Date().toISOString(),
    });

    if (newIdentity.success && newIdentity.data) {
      identityId = newIdentity.data.id;
    }
  }

  // Step 2: Analyze message with ChittyRouter AI
  const analysis = await chittyos.router.processMessage({
    messageId: message.id,
    from: fromNumber,
    to: toNumber,
    body: message.body,
    callerIdentity: identityId || undefined,
  });

  console.log('Message analysis:', {
    intent: analysis.data?.intent,
    sentiment: analysis.data?.sentiment,
    requiresHuman: analysis.data?.requiresHuman,
  });

  // Step 3: Store message in database
  if (identityId) {
    const messageQuery = queries.createMessageRecord(
      identityId,
      message.id,
      'inbound',
      fromNumber,
      toNumber,
      message.body,
      {
        openphoneData: message,
        aiAnalysis: analysis.data,
        trustScore: senderInfo.trustScore,
      }
    );
    await db.execute(messageQuery.sql, messageQuery.params);
  }

  // Step 4: Store in KV for real-time access
  await env.RECEPTION_KV.put(
    `message:${message.id}`,
    JSON.stringify({
      ...message,
      receivedAt: new Date().toISOString(),
      identity: senderInfo.identity,
      analysis: analysis.data,
    }),
    { expirationTtl: 86400 }
  );

  // Step 5: Log to ChittyChronicle
  await chittyos.chronicle.logEvent({
    service: 'chittyreception',
    action: 'message.received',
    identityId: identityId || undefined,
    resourceType: 'message',
    resourceId: message.id,
    details: {
      from: fromNumber,
      to: toNumber,
      intent: analysis.data?.intent,
      sentiment: analysis.data?.sentiment,
      bodyLength: message.body.length,
    },
    severity: analysis.data?.sentiment === 'urgent' ? 'warning' : 'info',
  });

  // Step 6: Auto-respond if appropriate
  if (analysis.data?.suggestedResponse && !analysis.data.requiresHuman) {
    // TODO: Send auto-response via OpenPhone
    console.log('Auto-response suggested:', analysis.data.suggestedResponse);
  }
}

/**
 * Handle voicemail created
 */
async function handleVoicemailCreated(event: OpenPhoneWebhookEvent, env: Env) {
  const voicemail = event.data.object as import('@/types/openphone').VoicemailObject;
  console.log('Voicemail received:', {
    voicemailId: voicemail.id,
    from: voicemail.from.phoneNumber,
    duration: voicemail.duration,
    hasTranscription: !!voicemail.transcription,
  });

  // Store voicemail in KV
  await env.RECEPTION_KV.put(
    `voicemail:${voicemail.id}`,
    JSON.stringify({
      ...voicemail,
      receivedAt: new Date().toISOString(),
    }),
    { expirationTtl: 86400 }
  );

  // TODO: Implement voicemail processing
  // - Store recording URL
  // - Process transcription with AI
  // - Extract action items
  // - Create case if needed
}

export default webhooks;
