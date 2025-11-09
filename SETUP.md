# ChittyReception Setup Guide

Complete setup instructions for configuring OpenPhone API integration.

## Prerequisites

- Cloudflare account (ID: `0bc21e3a5a9de1a4cc843be9c3e98121`)
- Node.js 18+ installed
- Wrangler CLI installed: `npm install -g wrangler`
- OpenPhone account with API access
- Access to shared Neon database (`chittyos-core`)

## Step-by-Step Setup

### 1. OpenPhone API Configuration

#### Get API Key

1. Log in to [OpenPhone Dashboard](https://app.openphone.com)
2. Navigate to **Settings** → **API & Integrations**
3. Click **Generate API Key**
4. **Important:** Copy the key immediately - it's only shown once!
5. Save securely (password manager recommended)

#### Configure Webhooks

1. In OpenPhone dashboard, go to **Settings** → **Webhooks**
2. Click **Add Webhook**
3. Configure:
   - **URL:** `https://reception.chitty.cc/webhooks/openphone`
   - **Events:** Select all:
     - ✅ `call.initiated`
     - ✅ `call.completed`
     - ✅ `message.created`
     - ✅ `voicemail.created`
4. Click **Create Webhook**
5. Copy the **Webhook Signing Secret** (shown once)

### 2. Local Development Setup

```bash
# Clone/navigate to project
cd chittyreception

# Install dependencies
npm install

# Create local environment file
cp .env.example .env

# Edit .env with your values
nano .env
```

Configure `.env`:

```bash
# OpenPhone (required)
OPENPHONE_API_KEY=sk_live_xxxxxxxxxxxxx
OPENPHONE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# ChittyOS Services (get from other services)
CHITTY_ID_SERVICE_TOKEN=token_from_chittyid
CHITTY_AUTH_SERVICE_TOKEN=token_from_chittyauth
CHITTY_CONNECT_SERVICE_TOKEN=token_from_chittyconnect

# Database (shared)
NEON_DATABASE_URL=postgresql://user:pass@host/chittyos-core

# Security (generate new)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Environment
ENVIRONMENT=development
```

### 3. Cloudflare Setup

#### Create KV Namespaces

```bash
# Production namespace
wrangler kv:namespace create RECEPTION_KV

# Preview/dev namespace
wrangler kv:namespace create RECEPTION_KV --preview
```

Output will be:
```
{ binding = "RECEPTION_KV", id = "abc123..." }
{ binding = "RECEPTION_KV", preview_id = "def456..." }
```

#### Update wrangler.toml

Edit `wrangler.toml` and replace placeholder IDs:

```toml
[[kv_namespaces]]
binding = "RECEPTION_KV"
id = "abc123..."  # Use ID from above
preview_id = "def456..."  # Use preview_id from above
```

#### Set Production Secrets

```bash
# Set all required secrets
wrangler secret put OPENPHONE_API_KEY
# Paste your OpenPhone API key when prompted

wrangler secret put OPENPHONE_WEBHOOK_SECRET
# Paste your webhook secret

wrangler secret put NEON_DATABASE_URL
# Paste your Neon database URL

wrangler secret put JWT_SECRET
# Generate: openssl rand -hex 32

wrangler secret put ENCRYPTION_KEY
# Generate: openssl rand -hex 32

wrangler secret put CHITTY_ID_SERVICE_TOKEN
# Get from chittyid service

wrangler secret put CHITTY_AUTH_SERVICE_TOKEN
# Get from chittyauth service

wrangler secret put CHITTY_CONNECT_SERVICE_TOKEN
# Get from chittyconnect service
```

#### Verify Secrets

```bash
wrangler secret list
```

Should show:
```
OPENPHONE_API_KEY
OPENPHONE_WEBHOOK_SECRET
NEON_DATABASE_URL
JWT_SECRET
ENCRYPTION_KEY
CHITTY_ID_SERVICE_TOKEN
CHITTY_AUTH_SERVICE_TOKEN
CHITTY_CONNECT_SERVICE_TOKEN
```

### 4. Database Setup

ChittyReception uses the shared `chittyos-core` database. Create tables:

```bash
# Connect to database
psql $NEON_DATABASE_URL

# Run schema (if not exists)
\i init-database.sql
```

Required tables:
- `identities` (from chittyid)
- `api_tokens` (from chittyauth)
- `audit_logs` (shared)

### 5. Test Locally

```bash
# Start dev server
npm run dev
```

Service runs on `http://localhost:8787`

#### Test Endpoints

```bash
# Health check
curl http://localhost:8787/api/v1/health

# Send test SMS (requires valid phone numbers)
curl -X POST http://localhost:8787/api/v1/send-message \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "to": ["+15559876543"],
    "content": "Test message from ChittyReception"
  }'
```

#### Test Webhook (ngrok required)

```bash
# In separate terminal, expose local server
ngrok http 8787

# Update OpenPhone webhook URL to ngrok URL
# Example: https://abc123.ngrok.io/webhooks/openphone

# Send test message to your OpenPhone number
# Check logs for webhook events
```

### 6. Deploy to Staging

```bash
# Deploy staging environment
npm run deploy:staging

# View logs
npm run tail
```

Update OpenPhone webhook URL:
```
https://chittyreception-staging.workers.dev/webhooks/openphone
```

Test staging deployment:
```bash
curl https://chittyreception-staging.workers.dev/api/v1/health
```

### 7. Deploy to Production

```bash
# Ensure all secrets are set
wrangler secret list

# Deploy production
npm run deploy:production

# Configure custom domain (Cloudflare dashboard)
# reception.chitty.cc → chittyreception-production
```

Update OpenPhone webhook URL:
```
https://reception.chitty.cc/webhooks/openphone
```

### 8. Register with ChittyRegistry

```bash
curl -X POST https://registry.chitty.cc/api/v1/register \
  -H "Authorization: Bearer $CHITTY_REGISTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "chittyreception",
    "version": "1.0.0",
    "endpoint": "https://reception.chitty.cc",
    "health_check": "https://reception.chitty.cc/api/v1/health",
    "capabilities": ["phone", "sms", "voicemail", "ai-routing"]
  }'
```

## Verification Checklist

- [ ] OpenPhone API key set and tested
- [ ] Webhook secret configured
- [ ] KV namespaces created and bound
- [ ] All secrets set in Cloudflare
- [ ] Database tables exist
- [ ] Local dev server runs
- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Webhooks receiving events
- [ ] Custom domain configured
- [ ] Service registered in ChittyRegistry

## Testing

### Manual Testing

1. **Send SMS via API:**
   ```bash
   curl -X POST https://reception.chitty.cc/api/v1/send-message \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "+15551234567",
       "to": ["+15559876543"],
       "content": "Test message"
     }'
   ```

2. **Receive SMS:** Send message to your OpenPhone number, check logs

3. **Make Call:**
   ```bash
   curl -X POST https://reception.chitty.cc/api/v1/make-call \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "+15551234567",
       "to": "+15559876543"
     }'
   ```

### Automated Testing

```bash
# Run test suite
npm test

# Run with coverage
npm run test -- --coverage
```

## Troubleshooting

### "Invalid API key" Error

1. Verify key in OpenPhone dashboard
2. Check secret is set: `wrangler secret list`
3. Regenerate key if necessary
4. Update secret: `wrangler secret put OPENPHONE_API_KEY`

### Webhook Not Receiving Events

1. Check webhook URL in OpenPhone dashboard
2. Verify URL is publicly accessible
3. Check webhook signature verification
4. View logs: `npm run tail`
5. Test webhook endpoint directly

### KV Storage Errors

1. Verify namespace exists: `wrangler kv:namespace list`
2. Check binding in wrangler.toml
3. Verify preview_id for local dev
4. Check namespace permissions

### Database Connection Errors

1. Test connection: `psql $NEON_DATABASE_URL -c "SELECT 1"`
2. Verify secret: `wrangler secret get NEON_DATABASE_URL`
3. Check IP allowlist in Neon dashboard
4. Verify database name is `chittyos-core`

## MCP Integration (Claude Code)

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chittyreception": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-fetch",
        "https://reception.chitty.cc/mcp"
      ]
    }
  }
}
```

Restart Claude Desktop to load MCP tools.

## Next Steps

1. **Test OpenPhone integration** - Send/receive test messages
2. **Implement AI orchestration** - Add intelligent routing
3. **Connect to ChittyConnect** - Link with case management
4. **Set up monitoring** - Configure alerts and dashboards
5. **Plan Twilio migration** - Evaluate cost savings

## Support

- Documentation: https://docs.chitty.cc/reception
- OpenPhone API: https://docs.openphone.com
- ChittyOS Issues: https://github.com/chittyos/issues
