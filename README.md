# ChittyReception

AI-powered answering and orchestration service for **Chicago Furnished Condos**. Sona, your virtual concierge, handles inbound/outbound calls and SMS with intelligent routing, business rule enforcement, and 24/7 availability.

## Overview

ChittyReception provides:
- **🤖 Sona AI Concierge** - Conversational AI with personality and business rules
- **📞 OpenPhone Integration** - Call and SMS handling with secure webhooks
- **✅ Booking Validation** - 32+ day minimum, month boundaries, advance notice
- **💰 Dynamic Pricing** - Automatic discounts and quote generation
- **🔐 ChittyAuth Integration** - Token-based authentication
- **💾 Database Persistence** - Neon PostgreSQL for calls, messages, conversations
- **🚨 Emergency Routing** - Immediate transfer for critical issues
- **🔧 MCP Server** - Claude Code integration for development
- **📊 Analytics** - Full audit trail and conversation tracking

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `OPENPHONE_API_KEY` - Your OpenPhone API key
- `OPENPHONE_WEBHOOK_SECRET` - Webhook signing secret
- `NEON_DATABASE_URL` - Shared ChittyOS database
- `JWT_SECRET` - Token signing secret

### 3. Set Up Database

**Run the migration to create tables:**

```bash
psql "$NEON_DATABASE_URL" < migration.sql
```

This creates:
- `reception_calls` - Call records
- `reception_messages` - SMS records
- `identity_phones` - Phone to ChittyID mapping
- `reception_sessions` - AI conversation state

### 4. Set Wrangler Secrets

```bash
wrangler secret put OPENPHONE_API_KEY
wrangler secret put OPENPHONE_WEBHOOK_SECRET
wrangler secret put NEON_DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put CHITTY_ID_SERVICE_TOKEN
wrangler secret put CHITTY_AUTH_SERVICE_TOKEN
wrangler secret put CHITTY_CONNECT_SERVICE_TOKEN
```

### 5. Create KV Namespace

```bash
wrangler kv:namespace create RECEPTION_KV
wrangler kv:namespace create RECEPTION_KV --preview

# Update wrangler.toml with the namespace IDs
```

### 5. Run Locally

```bash
npm run dev
```

Service will be available at `http://localhost:8787`

### 6. Deploy

```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## OpenPhone Setup

### 1. Get API Key

1. Log in to OpenPhone dashboard
2. Go to Settings > API & Integrations
3. Generate new API key
4. Save securely - shown only once

### 2. Configure Webhooks

Set webhook URL to your deployed service:

```
https://reception.chitty.cc/webhooks/openphone
```

Subscribe to events:
- `call.initiated` - Incoming call started
- `call.completed` - Call ended
- `message.created` - SMS received
- `voicemail.created` - Voicemail left

### 3. Get Webhook Secret

OpenPhone provides a webhook signing secret for verification. Add it to secrets.

## API Endpoints

### Health Check
```bash
GET /api/v1/health
```

### Send SMS
```bash
POST /api/v1/send-message
Content-Type: application/json
Authorization: Bearer {token}

{
  "from": "+15551234567",
  "to": ["+15559876543"],
  "content": "Your message here"
}
```

### Make Call
```bash
POST /api/v1/make-call
Content-Type: application/json
Authorization: Bearer {token}

{
  "from": "+15551234567",
  "to": "+15559876543"
}
```

### OpenPhone Webhook
```bash
POST /webhooks/openphone
X-OpenPhone-Signature: {hmac_signature}

{
  "id": "evt_xxx",
  "type": "message.created",
  "data": { ... }
}
```

## Architecture

### Service Flow

```
Incoming Call/SMS
  ↓
OpenPhone Webhook → ChittyReception
  ↓
Verify Signature
  ↓
Store in KV (24h TTL)
  ↓
AI Orchestration Engine
  ↓
Route to Handler / Auto-respond
  ↓
Update State in Durable Object
```

### Call State Management

Uses Cloudflare Durable Objects for persistent call state:
- Active call tracking
- Context preservation across webhook events
- Session data for AI agents

### Data Storage

- **KV Namespace** - Temporary storage (24h) for calls/messages
- **Durable Objects** - Active call state management
- **Neon Database** - Permanent records and case linkage

## Development

### Run Tests

```bash
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:watch    # Watch mode
```

### Type Checking

```bash
npm run typecheck
```

### View Logs

```bash
npm run tail          # Stream live logs
```

## Migration to Twilio

To migrate from OpenPhone to Twilio:

1. **Set Twilio secrets**
   ```bash
   wrangler secret put TWILIO_ACCOUNT_SID
   wrangler secret put TWILIO_AUTH_TOKEN
   ```

2. **Create Twilio client** (similar to OpenPhone client)
3. **Update webhook handlers** for Twilio format
4. **Configure TwiML** for call flows
5. **Update wrangler.toml** environment variables

## Integration with ChittyOS

### Service Dependencies

- **ChittyID** - Generate identities for callers
- **ChittyAuth** - Token validation for API calls
- **ChittyConnect** - Link calls to cases and contacts
- **ChittyRegistry** - Service discovery and registration

### Authentication

All API endpoints (except webhooks) require ChittyAuth tokens:

```
Authorization: Bearer {token}
```

Webhooks use signature verification instead.

## Claude Integration

ChittyReception provides **three** Claude integration methods:

### 1. MCP Server (Claude Desktop) - ✅ READY

```bash
# Build the MCP server
npm run build:mcp

# Add to Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json)
{
  "mcpServers": {
    "chittyreception": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
      "env": {
        "OPENPHONE_API_KEY": "your_openphone_api_key",
        "NEON_DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

**Available Tools:**
- `send_sms` - Send SMS messages via OpenPhone
- `make_call` - Make outbound calls
- `get_call_history` - Query call records with filters (phone, direction, limit)
- `get_message_history` - Query message records with filters
- `search_guest_by_phone` - Look up guest ChittyID and recent interactions
- `get_conversation_context` - Get full chronological conversation timeline

### 2. HTTP MCP Endpoint (Web/Mobile) - ✅ READY

**Endpoint:** `https://chittyreception-production.ccorp.workers.dev/mcp`

Authenticated HTTP endpoint for web-based Claude and Custom GPT Actions.

```bash
# List available tools (no auth required)
curl https://chittyreception-production.ccorp.workers.dev/mcp/tools

# Call a tool (auth required)
curl -X POST https://chittyreception-production.ccorp.workers.dev/mcp \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "get_call_history",
      "arguments": {"limit": 10}
    }
  }'
```

### 3. Claude Skill (Marketplace) - 🚧 DESIGN PHASE

Packaged skill for Claude Marketplace with OAuth flow and built-in UI.

**Status:** Architecture designed (see CLAUDE_SKILL_DESIGN.md)
**Timeline:** Q2 2025 target launch

**📖 Complete Documentation:** See [CLAUDE_INTEGRATION.md](./CLAUDE_INTEGRATION.md) for full setup instructions, troubleshooting, examples, and skill design.

## Troubleshooting

### Webhook Not Receiving Events

1. Check OpenPhone webhook configuration
2. Verify webhook URL is publicly accessible
3. Check Cloudflare Worker logs: `npm run tail`
4. Ensure `OPENPHONE_WEBHOOK_SECRET` matches OpenPhone dashboard

### API Authentication Failures

1. Verify token is valid and not expired
2. Check `JWT_SECRET` matches ChittyAuth
3. Ensure token has required scopes
4. Check `Authorization` header format

### KV Storage Issues

1. Verify KV namespace is bound correctly in wrangler.toml
2. Check KV namespace exists: `wrangler kv:namespace list`
3. View KV contents: `wrangler kv:key list --namespace-id={id}`

## Cost Optimization

### OpenPhone Pricing
- Good for testing and low volume
- Higher per-message/minute costs at scale

### Twilio Migration Benefits
- Lower per-unit costs
- Better bulk pricing
- More features (TwiML, Programmable Voice)
- Wider geographic coverage

Recommended migration threshold: **1000+ messages/month**

## Contributing

Follow ChittyOS development guidelines in root `CLAUDE.md`.

## License

Proprietary - ChittyOS Platform
