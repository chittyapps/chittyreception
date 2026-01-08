# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **🎯 Project Orchestration:** This project follows [ChittyCan™ Project Standards](../chittycan/CHITTYCAN_PROJECT_ORCHESTRATOR.md) <!-- was: ../CHITTYCAN_PROJECT_ORCHESTRATOR.md -->

## Project Overview

**ChittyReception** is an AI-powered answering and orchestration service for Chicago Furnished Condos. Sona, your virtual concierge, handles inbound/outbound calls and SMS with intelligent routing, business rule enforcement, and 24/7 availability via OpenPhone integration.

**Key Characteristics:**
- Cloudflare Workers serverless architecture
- OpenPhone webhook integration for calls and SMS
- Sona AI concierge with personality and business rules
- Booking validation (32+ day minimum, month boundaries)
- Dynamic pricing with automatic discounts
- ChittyAuth token-based authentication
- Neon PostgreSQL chittyos-core database integration
- Durable Objects for call state management
- KV namespace for temporary storage (24h TTL)
- **Claude Integration:** Standalone MCP server + HTTP endpoint (see CLAUDE_INTEGRATION.md)

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

### Data Storage
- **KV Namespace**: Temporary storage (24h) for calls/messages
- **Durable Objects**: Active call state management
- **Neon Database**: Permanent records and case linkage

### Database Tables
- `reception_calls` - Call records
- `reception_messages` - SMS records
- `identity_phones` - Phone to ChittyID mapping
- `reception_sessions` - AI conversation state

## Essential Commands

### Development
```bash
npm install              # Install dependencies
npm run dev              # Start Wrangler dev server (localhost:8787)
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run typecheck        # TypeScript type checking
```

### Database
```bash
# Apply migration to shared chittyos-core database
psql "$NEON_DATABASE_URL" < migration.sql

# Connect to database
chitty_db
```

### Deployment
```bash
npm run deploy:staging       # Deploy to staging
npm run deploy:production    # Deploy to production
npm run tail                 # Stream live logs
```

### Secrets Management
```bash
wrangler secret put OPENPHONE_API_KEY
wrangler secret put OPENPHONE_WEBHOOK_SECRET
wrangler secret put NEON_DATABASE_URL
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
wrangler secret put CHITTY_ID_SERVICE_TOKEN
wrangler secret put CHITTY_AUTH_SERVICE_TOKEN
wrangler secret put CHITTY_CONNECT_SERVICE_TOKEN
wrangler secret list  # Verify all secrets
```

## API Endpoints

### Health Check
```bash
GET /api/v1/health
```

### Send SMS (Authenticated)
```bash
POST /api/v1/send-message
Authorization: Bearer {token}
Content-Type: application/json

{
  "from": "+15551234567",
  "to": ["+15559876543"],
  "content": "Your message here"
}
```

### Make Call (Authenticated)
```bash
POST /api/v1/make-call
Authorization: Bearer {token}
Content-Type: application/json

{
  "from": "+15551234567",
  "to": "+15559876543"
}
```

### OpenPhone Webhook (Signature Verified)
```bash
POST /webhooks/openphone
X-OpenPhone-Signature: {hmac_signature}

{
  "id": "evt_xxx",
  "type": "message.created",
  "data": { ... }
}
```

## Integration with ChittyOS

### Service Dependencies
- **ChittyID** (id.chitty.cc) - Generate identities for callers
- **ChittyAuth** (auth.chitty.cc) - Token validation for API calls
- **ChittyConnect** (connect.chitty.cc) - Link calls to cases and contacts
- **ChittyRegistry** (registry.chitty.cc) - Service discovery

### Authentication
All API endpoints (except webhooks) require ChittyAuth tokens:
```
Authorization: Bearer {token}
```

Webhooks use HMAC signature verification instead.

## Sona AI Concierge

**Personality**: Professional, friendly, efficient
**Business Rules**:
- 32+ day minimum stay requirement
- Month boundary constraints (check-in/check-out on 1st)
- Advance notice requirements
- Dynamic pricing based on length of stay

**Emergency Routing**: Immediate transfer for:
- Property damage
- Safety concerns
- Lock-out situations
- Medical emergencies

## Claude Integration

ChittyReception provides **three** Claude integration methods:

### 1. MCP Server (Claude Desktop) - ✅ READY
Standalone Node.js MCP server with stdio transport for local Claude Desktop integration.

**Setup:**
```bash
# Build the MCP server
npm run build:mcp

# Configure Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json)
{
  "mcpServers": {
    "chittyreception": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
      "env": {
        "OPENPHONE_API_KEY": "your_key",
        "NEON_DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

**Available Tools:**
- `send_sms` - Send SMS messages via OpenPhone
- `make_call` - Make outbound calls
- `get_call_history` - Retrieve database call records with filters
- `get_message_history` - Retrieve database message records with filters
- `search_guest_by_phone` - Look up guest ChittyID and interaction history
- `get_conversation_context` - Get full chronological conversation timeline

### 2. HTTP MCP Endpoint (Web/Mobile) - ✅ READY
Authenticated HTTP endpoint for web-based Claude access and Custom GPT Actions.

**Endpoint:** `https://chittyreception-production.ccorp.workers.dev/mcp`

**Authentication:** ChittyAuth Bearer token required for tool calls

**Usage:**
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

**Complete Documentation:** See `CLAUDE_INTEGRATION.md` for full setup instructions, troubleshooting, and examples.

## Migration Path to Twilio

For call volumes exceeding 1000 messages/month:

1. Set Twilio secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
2. Create Twilio client wrapper (similar to OpenPhone client)
3. Update webhook handlers for Twilio format
4. Configure TwiML for call flows
5. Update wrangler.toml environment variables

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

### Database Connection Issues
```bash
# Verify database URL is set
wrangler secret list | grep NEON

# Test connection
psql $NEON_DATABASE_URL -c "SELECT 1"
```

### KV Storage Issues
1. Verify KV namespace is bound correctly in wrangler.toml
2. Check KV namespace exists: `wrangler kv:namespace list`
3. View KV contents: `wrangler kv:key list --namespace-id={id}`

## Key Files

- `src/index.ts` - Main entry point and route handlers
- `src/routes/` - API route handlers
- `src/services/` - Business logic (OpenPhone, AI, booking)
- `src/lib/` - Utilities (database, validation, auth)
- `src/types/` - TypeScript type definitions
- `wrangler.toml` - Cloudflare configuration
- `migration.sql` - Database schema
- `tests/` - Test suites

## Cost Optimization

**OpenPhone Pricing:**
- Good for testing and low volume
- Higher per-message/minute costs at scale

**Twilio Migration Benefits:**
- Lower per-unit costs
- Better bulk pricing
- More features (TwiML, Programmable Voice)
- Wider geographic coverage

**Recommended migration threshold**: 1000+ messages/month

## Development Guidelines

1. All database changes must be coordinated with other ChittyOS services
2. Service tokens are required for inter-service calls
3. AI operations timeout at 30 seconds on Cloudflare Workers
4. Test locally with `npm run dev` before deploying
5. Deploy to staging first, then production
6. Follow ChittyOS development guidelines in root `CLAUDE.md`

## Deployment URLs

- **Staging**: https://reception-staging.chitty.cc
- **Production**: https://reception.chitty.cc
- **OpenPhone Dashboard**: https://app.openphone.com
- **Cloudflare Account**: 0bc21e3a5a9de1a4cc843be9c3e98121
