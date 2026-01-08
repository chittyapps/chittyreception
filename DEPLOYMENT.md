# ChittyReception Deployment Guide

This guide walks through deploying ChittyReception to Cloudflare Workers staging and production environments with the new Claude MCP integration.

## Prerequisites

- Node.js 18+ installed
- Wrangler CLI authenticated (`wrangler login`)
- Access to Cloudflare account: `0bc21e3a5a9de1a4cc843be9c3e98121`
- OpenPhone API credentials
- ChittyOS service tokens (ChittyID, ChittyAuth, ChittyConnect)
- Neon PostgreSQL database URL

## Configuration Status

### wrangler.toml ✅
- **AI Bindings**: Configured for default, staging, and production
- **KV Namespace**: `RECEPTION_KV` bound to all environments
- **Durable Objects**: `CALL_STATE` configured with proper script names
- **Node.js Compatibility**: Enabled for Neon database support

### Required Secrets (8 per environment)

| Secret Name | Purpose | Source |
|------------|---------|--------|
| `OPENPHONE_API_KEY` | OpenPhone API authentication | OpenPhone Dashboard |
| `OPENPHONE_WEBHOOK_SECRET` | Webhook signature verification | OpenPhone Dashboard |
| `NEON_DATABASE_URL` | PostgreSQL connection string | Neon Console |
| `JWT_SECRET` | Token validation (matches ChittyAuth) | ChittyAuth |
| `ENCRYPTION_KEY` | Data encryption | Generated |
| `CHITTY_ID_SERVICE_TOKEN` | Service-to-service auth | ChittyID |
| `CHITTY_AUTH_SERVICE_TOKEN` | Service-to-service auth | ChittyAuth |
| `CHITTY_CONNECT_SERVICE_TOKEN` | Service-to-service auth | ChittyConnect |

## Deployment Process

### Phase 1: Pre-Deployment

#### 1. Verify Configuration

```bash
# Check TypeScript compilation
npm run typecheck

# Check current secrets
wrangler secret list --env staging
wrangler secret list --env production
```

#### 2. Set Secrets

Use the interactive script:

```bash
./set-secrets.sh
```

Or manually set each secret:

```bash
# Staging
wrangler secret put OPENPHONE_API_KEY --env staging
wrangler secret put OPENPHONE_WEBHOOK_SECRET --env staging
wrangler secret put NEON_DATABASE_URL --env staging
wrangler secret put JWT_SECRET --env staging
wrangler secret put ENCRYPTION_KEY --env staging
wrangler secret put CHITTY_ID_SERVICE_TOKEN --env staging
wrangler secret put CHITTY_AUTH_SERVICE_TOKEN --env staging
wrangler secret put CHITTY_CONNECT_SERVICE_TOKEN --env staging

# Production (repeat with --env production)
```

#### 3. Verify Secrets

```bash
# Should show 8 secrets for staging
wrangler secret list --env staging | grep -v WARNING

# Should show 8 secrets for production
wrangler secret list --env production | grep -v WARNING
```

### Phase 2: Staging Deployment

#### 1. Deploy to Staging

```bash
# Automated deployment with checks
./deploy-staging.sh

# Or manual deployment
npm run build
npm run deploy:staging
```

#### 2. Verify Deployment

```bash
# Run automated tests
./test-deployment.sh
# Select option 1 for staging

# Or manual verification
curl https://chittyreception-staging.ccorp.workers.dev/api/v1/health
curl https://chittyreception-staging.ccorp.workers.dev/mcp/tools
```

Expected responses:

**Health Check:**
```json
{
  "status": "healthy",
  "service": "chittyreception",
  "environment": "staging",
  "timestamp": "2025-11-09T...",
  "database": "connected"
}
```

**MCP Tools:**
```json
{
  "tools": [
    {
      "name": "send_sms",
      "description": "Send SMS message via OpenPhone",
      "inputSchema": { ... }
    },
    {
      "name": "make_call",
      "description": "Make outbound call via OpenPhone",
      "inputSchema": { ... }
    },
    // ... more tools
  ]
}
```

#### 3. Monitor Logs

```bash
# Stream live logs
npm run tail -- --env staging

# Watch for errors or warnings
```

#### 4. Test MCP Integration

Update your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chittyreception": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
      "env": {
        "OPENPHONE_API_KEY": "your_key",
        "NEON_DATABASE_URL": "postgresql://...",
        "API_BASE_URL": "https://chittyreception-staging.ccorp.workers.dev"
      }
    }
  }
}
```

Restart Claude Desktop and verify MCP tools appear.

### Phase 3: Production Deployment

#### 1. Pre-Production Checklist

- [ ] Staging deployment is healthy
- [ ] All staging tests pass
- [ ] MCP integration tested in staging
- [ ] Production secrets are set
- [ ] Database migration applied (if needed)
- [ ] Backup plan in place

#### 2. Deploy to Production

```bash
# Automated deployment with safety checks
./deploy-production.sh

# Or manual deployment
npm run build
npm run deploy:production
```

#### 3. Verify Production

```bash
# Run automated tests
./test-deployment.sh
# Select option 2 for production

# Manual verification
curl https://chittyreception-production.ccorp.workers.dev/api/v1/health
curl https://chittyreception-production.ccorp.workers.dev/mcp/tools
```

#### 4. Configure OpenPhone Webhook

1. Go to OpenPhone Dashboard → Settings → Webhooks
2. Update webhook URL to production:
   ```
   https://chittyreception-production.ccorp.workers.dev/webhooks/openphone
   ```
3. Ensure webhook secret matches `OPENPHONE_WEBHOOK_SECRET`
4. Test webhook delivery with a test call/SMS

#### 5. Update Claude Desktop (Production)

Update your Claude Desktop config to use production:

```json
{
  "mcpServers": {
    "chittyreception": {
      "command": "node",
      "args": ["/Users/nb/Projects/development/chittyreception/mcp-server.js"],
      "env": {
        "OPENPHONE_API_KEY": "your_key",
        "NEON_DATABASE_URL": "postgresql://...",
        "API_BASE_URL": "https://chittyreception-production.ccorp.workers.dev"
      }
    }
  }
}
```

## Post-Deployment

### Monitoring

```bash
# Stream production logs
npm run tail -- --env production

# Check Cloudflare dashboard
# https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/workers/services/view/chittyreception-production/production
```

### Testing End-to-End

1. **Inbound Call Test**:
   - Call your OpenPhone number
   - Verify webhook is received
   - Check logs for AI processing
   - Verify call record in database

2. **Outbound SMS Test**:
   ```bash
   curl -X POST https://chittyreception-production.ccorp.workers.dev/api/v1/send-message \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "from": "+15551234567",
       "to": ["+15559876543"],
       "content": "Test message from ChittyReception"
     }'
   ```

3. **MCP Tools Test**:
   - Open Claude Desktop
   - Use MCP tools to query call history
   - Verify database queries work correctly

### Troubleshooting

#### Deployment Fails

```bash
# Check secrets are set
wrangler secret list --env staging

# Check wrangler.toml syntax
wrangler deploy --env staging --dry-run

# View detailed error logs
npm run tail -- --env staging
```

#### Database Connection Issues

```bash
# Test database connection
psql "$NEON_DATABASE_URL" -c "SELECT 1"

# Verify secret is set correctly
wrangler secret list --env staging | grep NEON
```

#### Webhook Not Receiving Events

1. Check OpenPhone webhook configuration
2. Verify webhook URL is publicly accessible
3. Test signature verification:
   ```bash
   # Check logs for signature validation errors
   npm run tail -- --env production
   ```

#### MCP Tools Not Working

1. Verify Claude Desktop config syntax
2. Check MCP server builds successfully:
   ```bash
   npm run build:mcp
   node mcp-server.js  # Should show MCP server info
   ```
3. Check logs for tool execution errors

## Rollback Procedure

If production deployment fails:

```bash
# Option 1: Redeploy previous version
git checkout <previous-commit>
npm run deploy:production

# Option 2: Point traffic to staging temporarily
# Update OpenPhone webhook to staging URL
```

## Environment URLs

- **Staging**: https://chittyreception-staging.ccorp.workers.dev
- **Production**: https://chittyreception-production.ccorp.workers.dev
- **Cloudflare Dashboard**: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121

## Support Resources

- **ChittyOS Documentation**: See root `/CLAUDE.md`
- **OpenPhone API**: https://docs.openphone.com
- **Cloudflare Workers**: https://developers.cloudflare.com/workers
- **MCP Protocol**: https://modelcontextprotocol.io

## Quick Reference Commands

```bash
# Deployment
./deploy-staging.sh           # Deploy to staging
./deploy-production.sh        # Deploy to production

# Testing
./test-deployment.sh          # Test deployed service

# Secrets
./set-secrets.sh              # Manage secrets interactively
wrangler secret list --env staging    # List secrets

# Monitoring
npm run tail -- --env staging         # Stream logs
npm run tail -- --env production

# Development
npm run dev                   # Local development
npm run typecheck             # Type check
npm test                      # Run tests
```
