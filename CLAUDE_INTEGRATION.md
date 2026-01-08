# ChittyReception Claude Integration Guide

Complete guide for integrating ChittyReception with Claude across multiple platforms (Desktop, web, mobile).

## Overview

ChittyReception provides three integration methods:

1. **Standalone MCP Server** - For Claude Desktop (local stdio transport)
2. **HTTP MCP Endpoint** - For web-based Claude access (authenticated API)
3. **Claude Skill** - For Marketplace distribution (future deployment)

## Integration 1: Claude Desktop (MCP Server)

### What You Get

A local MCP server that gives Claude Desktop direct access to:
- Send SMS messages via OpenPhone
- Make outbound calls
- Query call and message history from the database
- Search guests by phone number
- Get full conversation context for any phone number

### Setup Instructions

#### Step 1: Install Dependencies

```bash
cd /Users/nb/Projects/development/chittyreception
npm install
```

#### Step 2: Build the MCP Server

```bash
npm run build:mcp
```

This compiles `mcp-server.ts` to `mcp-server.js`.

#### Step 3: Configure Environment Variables

Create a `.env` file in the project root (or set environment variables in Claude Desktop config):

```bash
OPENPHONE_API_KEY=your_openphone_api_key
NEON_DATABASE_URL=postgresql://user:password@host/database
CHITTY_ID_SERVICE_TOKEN=your_chitty_id_token
CHITTY_AUTH_SERVICE_TOKEN=your_chitty_auth_token
```

#### Step 4: Configure Claude Desktop

Add to Claude Desktop's MCP configuration file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "chittyreception": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
      "env": {
        "OPENPHONE_API_KEY": "your_openphone_api_key",
        "NEON_DATABASE_URL": "postgresql://user:password@host/database",
        "CHITTY_ID_SERVICE_TOKEN": "your_token",
        "CHITTY_AUTH_SERVICE_TOKEN": "your_token"
      }
    }
  }
}
```

**Important:** Use absolute paths for the `args` field. Update the path to match your actual installation location.

#### Step 5: Restart Claude Desktop

Close and reopen Claude Desktop. The MCP server will automatically start when Claude launches.

#### Step 6: Verify Integration

In Claude Desktop, you should see:
- MCP status indicator showing "chittyreception" is connected
- Tools available when you click the tools icon

Try asking Claude:
```
"Can you check my recent calls from ChittyReception?"
"Send an SMS to +15551234567 saying 'Your booking is confirmed'"
```

### Available Tools

1. **send_sms** - Send SMS messages
   - Parameters: `from` (phone), `to` (array of phones), `content` (message)
   - Stores message in database automatically

2. **make_call** - Initiate outbound calls
   - Parameters: `from` (phone), `to` (phone), `maxDuration` (optional)
   - Stores call record in database

3. **get_call_history** - Retrieve call records
   - Parameters: `limit` (default: 10, max: 100), `phoneNumber` (filter), `direction` (filter)
   - Returns detailed call history from database

4. **get_message_history** - Retrieve message records
   - Parameters: `limit`, `phoneNumber`, `direction`
   - Returns message content and metadata

5. **search_guest_by_phone** - Look up guest information
   - Parameters: `phoneNumber`
   - Returns ChittyID, identity details, and recent interaction history

6. **get_conversation_context** - Get full conversation timeline
   - Parameters: `phoneNumber`, `days` (default: 7, max: 30)
   - Returns chronological list of all calls and messages

### Troubleshooting

**MCP server not connecting:**
- Check Claude Desktop logs: `~/Library/Logs/Claude/mcp.log` (macOS)
- Verify absolute path to `mcp-server.js` is correct
- Ensure all environment variables are set
- Check that Node.js is in your PATH

**Database connection errors:**
- Verify `NEON_DATABASE_URL` is correct and accessible
- Test connection: `psql "$NEON_DATABASE_URL" -c "SELECT 1"`
- Check database has required tables (see `migration.sql`)

**OpenPhone API errors:**
- Verify `OPENPHONE_API_KEY` is valid
- Check phone numbers are in E.164 format (+15551234567)
- Ensure OpenPhone account has necessary permissions

**Tools not appearing:**
- Restart Claude Desktop completely
- Check `mcp-server.js` was compiled successfully
- Review MCP logs for startup errors

## Integration 2: HTTP MCP Endpoint (Web/Mobile)

### What You Get

An authenticated HTTP endpoint for web-based Claude access (Custom GPT Actions, Claude.ai web, future mobile connectors).

### Endpoint Information

**Base URL:**
- Production: `https://chittyreception-production.ccorp.workers.dev/mcp`
- Staging: `https://chittyreception-staging.ccorp.workers.dev/mcp`

**Authentication:**
- All tool calls require ChittyAuth Bearer token
- Tool listing (`GET /mcp/tools`) is public for discovery

### Usage with Custom GPT Actions

#### Step 1: Create API Token

Use ChittyAuth to provision a token with required scopes:

```bash
curl -X POST https://auth.chitty.cc/api/v1/tokens \
  -H "Authorization: Bearer {your_admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ChittyReception GPT Access",
    "scopes": ["chittyreception:read", "chittyreception:write"],
    "expiresIn": "90d"
  }'
```

Save the returned token securely.

#### Step 2: Configure GPT Actions

In ChatGPT's GPT editor, add an Action with this schema:

```yaml
openapi: 3.1.0
info:
  title: ChittyReception MCP API
  description: AI-powered phone and SMS system for Chicago Furnished Condos
  version: 1.0.0
servers:
  - url: https://chittyreception-production.ccorp.workers.dev
paths:
  /mcp:
    post:
      operationId: callMCPTool
      summary: Execute an MCP tool
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                method:
                  type: string
                  enum: [tools/list, tools/call]
                params:
                  type: object
                  properties:
                    name:
                      type: string
                    arguments:
                      type: object
      responses:
        '200':
          description: Tool execution result
  /mcp/tools:
    get:
      operationId: listMCPTools
      summary: List available tools
      responses:
        '200':
          description: List of available tools
```

#### Step 3: Add Authentication

In the GPT Actions authentication section:
- Type: **API Key**
- Header: `Authorization`
- Value: `Bearer {your_token}`

#### Step 4: Test the Integration

Ask your GPT:
```
"Get recent call history from ChittyReception"
"Send an SMS to a guest at +15551234567"
```

### Direct HTTP API Usage

**List tools:**
```bash
curl https://chittyreception-production.ccorp.workers.dev/mcp/tools
```

**Call a tool:**
```bash
curl -X POST https://chittyreception-production.ccorp.workers.dev/mcp \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "send_sms",
      "arguments": {
        "from": "+15551234567",
        "to": ["+15559876543"],
        "content": "Your booking is confirmed for March 1-31!"
      }
    }
  }'
```

## Integration 3: Claude Skill (Marketplace)

### Status: Design Phase

A Claude Skill package for deployment to the Claude Marketplace would provide:

**Features:**
- One-click installation for Claude users
- Pre-configured authentication flow
- Built-in UI for phone number selection
- Conversation history browsing
- Real-time call/SMS notifications

**Architecture:**

```
Claude Skill Package
├── skill.json          # Skill manifest
├── auth/
│   ├── oauth.ts        # OAuth 2.0 flow for ChittyAuth
│   └── pkce.ts         # PKCE implementation
├── tools/
│   ├── messaging.ts    # SMS tools
│   ├── calling.ts      # Voice tools
│   └── history.ts      # Data retrieval tools
├── ui/
│   ├── PhoneSelector.tsx
│   └── ConversationView.tsx
└── webhooks/
    └── openphone.ts    # Real-time event handling
```

**Installation Flow:**

1. User discovers "ChittyReception" in Claude Marketplace
2. Clicks "Install Skill"
3. Redirected to ChittyAuth for OAuth authorization
4. User grants `chittyreception:read` and `chittyreception:write` scopes
5. Skill installed and immediately available
6. Claude can now use tools in conversations

**Recommended Deployment Timeline:**

- **Phase 1 (Current):** MCP server for internal use
- **Phase 2 (Q1 2025):** HTTP MCP endpoint for Custom GPT Actions
- **Phase 3 (Q2 2025):** Claude Skill for Marketplace (pending Anthropic SDK availability)

### Skill Development Considerations

**Authentication:**
- Use ChittyAuth OAuth 2.0 provider
- Implement PKCE for security
- Request minimal scopes needed
- Provide clear consent screen

**User Experience:**
- Auto-detect OpenPhone numbers from account
- Show conversation history in threaded view
- Provide clear feedback for sent messages/calls
- Handle errors gracefully with retry options

**Rate Limiting:**
- Respect OpenPhone API limits
- Implement client-side throttling
- Show quota usage to users
- Queue actions if necessary

**Privacy & Security:**
- Encrypt phone numbers in transit and at rest
- Never log message content
- Implement data retention policies
- Provide data export/deletion options

## Multi-Platform Strategy

### Desktop Integration (Now Available)
- **Method:** Standalone MCP server via stdio
- **Authentication:** Environment variables
- **Use Case:** Power users, development, testing
- **Latency:** Lowest (local process)

### Web Integration (Now Available)
- **Method:** HTTP MCP endpoint
- **Authentication:** ChittyAuth Bearer tokens
- **Use Case:** Custom GPT Actions, browser extensions
- **Latency:** Low (edge-deployed Workers)

### Mobile Integration (Future)
- **Method:** Claude mobile app connector
- **Authentication:** OAuth 2.0 with PKCE
- **Use Case:** On-the-go guest communications
- **Latency:** Low (Cloudflare edge)

### Skill Marketplace (Future)
- **Method:** Packaged Claude Skill
- **Authentication:** OAuth 2.0 integrated
- **Use Case:** General Claude users
- **Latency:** Low (skill runtime)

## Security Considerations

### Token Security

**Best Practices:**
- Rotate API tokens every 90 days
- Use separate tokens for different environments (dev/staging/prod)
- Never commit tokens to version control
- Store tokens in secure environment variables or secrets managers

**Scope Principle:**
- Request minimum scopes required: `chittyreception:read` for queries only
- Use `chittyreception:write` only when sending messages/making calls
- Consider read-only tokens for analytics/reporting use cases

### Database Security

- All queries use parameterized statements (SQL injection protection)
- Sensitive data (phone numbers) should be encrypted at rest
- Audit logs track all operations with ChittyID attribution
- Database credentials use connection pooling with TLS

### OpenPhone Security

- API keys stored as Cloudflare Workers secrets
- Webhook signature verification prevents spoofing
- Rate limiting prevents abuse
- Failed authentication attempts logged

## Monitoring & Observability

### Logs

**MCP Server (Desktop):**
- Logs to stderr (visible in Claude Desktop logs)
- Tool calls logged with parameters (sensitive data redacted)

**HTTP Endpoint (Web):**
- Cloudflare Workers logs via `wrangler tail`
- Request/response metrics in Cloudflare dashboard
- Audit logs in Neon database

### Metrics to Track

- Tool call volume and latency
- Authentication success/failure rates
- Database query performance
- OpenPhone API response times
- Error rates by tool and error type

### Alerts

Set up alerts for:
- Authentication failures exceeding threshold
- Database connection failures
- OpenPhone API errors
- Tool call latency over 5 seconds
- Unusual traffic patterns

## Cost Management

### OpenPhone Costs
- **SMS:** $0.0075 per message (domestic US)
- **Voice:** $0.013 per minute
- **Recommendation:** Monitor usage via OpenPhone dashboard
- **Migration Threshold:** Switch to Twilio after 1000+ messages/month

### Cloudflare Costs
- Workers: Free tier covers most usage
- Database: Neon free tier (500MB storage)
- R2 Storage: Free tier (10GB)
- **Recommendation:** Monitor via Cloudflare Analytics

### Database Costs
- Neon PostgreSQL: Free tier up to 500MB
- Scaling: $19/month for 10GB
- **Recommendation:** Archive old call/message data after 90 days

## Support & Resources

### Documentation
- ChittyOS Overview: `/Users/nb/Projects/development/CLAUDE.md`
- ChittyReception Docs: `/Users/nb/Projects/development/chittyreception/CLAUDE.md`
- MCP Specification: https://modelcontextprotocol.io

### API References
- OpenPhone API: https://docs.openphone.com/reference
- ChittyAuth: https://auth.chitty.cc/docs
- ChittyID: https://id.chitty.cc/docs

### Community
- ChittyOS GitHub: https://github.com/chittyos
- Discord: https://discord.gg/chittyos
- Email: support@chitty.cc

## Example Use Cases

### Use Case 1: Guest Check-In Reminder

**Scenario:** Send check-in instructions to all guests arriving tomorrow.

**Claude Desktop:**
```
User: "Send check-in instructions to all guests arriving tomorrow"

Claude uses:
1. search_guest_by_phone (for each guest)
2. send_sms with customized message
```

### Use Case 2: Emergency Contact

**Scenario:** Guest reports property damage, need to contact property owner immediately.

**Claude Desktop:**
```
User: "Guest at unit 204 reports water leak. Contact the owner immediately."

Claude uses:
1. get_conversation_context (find guest's recent messages)
2. search_guest_by_phone (identify owner)
3. make_call (call owner)
4. send_sms (follow-up SMS with details)
```

### Use Case 3: Booking Inquiry Analysis

**Scenario:** Analyze recent booking inquiries to identify conversion patterns.

**Claude Desktop:**
```
User: "Analyze the last 50 inbound messages for booking intent"

Claude uses:
1. get_message_history (limit: 50, direction: inbound)
2. Analyzes content for booking keywords
3. Categorizes: booking request, question, complaint, etc.
4. Generates report with insights
```

### Use Case 4: Follow-Up Campaign

**Scenario:** Send feedback request to guests who checked out this week.

**Claude Desktop:**
```
User: "Send feedback surveys to guests who checked out this week"

Claude uses:
1. get_call_history (recent check-out confirmations)
2. send_sms (personalized feedback request to each guest)
3. Tracks responses in database
```

## Development Workflow

### Local Development

```bash
# Start local Workers dev server
npm run dev

# Test MCP server locally
npm run build:mcp
node mcp-server.js

# Run tests
npm test

# Type checking
npm run typecheck
```

### Deploying Changes

```bash
# Deploy to staging
npm run deploy:staging

# Test in staging
curl https://chittyreception-staging.ccorp.workers.dev/mcp/tools

# Deploy to production
npm run deploy:production

# Monitor logs
npm run tail
```

### Database Migrations

```bash
# Apply migration
psql "$NEON_DATABASE_URL" < migration.sql

# Verify tables exist
psql "$NEON_DATABASE_URL" -c "\dt reception_*"
```

## Future Enhancements

### Planned Features

1. **Voice Transcription**
   - Auto-transcribe call recordings
   - Search transcripts for keywords
   - Sentiment analysis on calls

2. **AI-Powered Routing**
   - Classify incoming messages automatically
   - Route to appropriate handler (booking, maintenance, emergency)
   - Auto-respond to common questions

3. **Analytics Dashboard**
   - Real-time call/SMS metrics
   - Conversion funnel visualization
   - Guest satisfaction scores

4. **Multi-Property Support**
   - Separate phone lines per property
   - Property-specific routing rules
   - Consolidated reporting

5. **Integration Expansion**
   - Twilio migration for scale
   - Notion workspace sync
   - Google Calendar booking integration
   - Airbnb/VRBO messaging sync

### Contributing

To contribute integrations or improvements:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/claude-skill`
3. Implement changes with tests
4. Submit pull request with clear description
5. Tag for review: `@chittyos/integrations`

## License

ChittyReception is part of the ChittyOS ecosystem.
Copyright 2024-2025 ChittyOS. All rights reserved.
