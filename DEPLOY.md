# ChittyReception Deployment Guide

Complete deployment checklist for production.

## Pre-Deployment Checklist

### 1. Database Setup

**Use `migration.sql` for database tables:**

```bash
# Connect to shared Neon database
psql "$NEON_DATABASE_URL" < migration.sql
```

This creates:
- `reception_calls` - Call records with OpenPhone IDs
- `reception_messages` - SMS message records
- `identity_phones` - Phone number to ChittyID mapping
- `reception_sessions` - AI conversation sessions

Verify tables exist:
```sql
\dt reception_*
```

### 2. Install Dependencies

```bash
npm install
```

Key dependencies:
- `hono` - Web framework
- `@neondatabase/serverless` - Neon PostgreSQL driver

### 3. Configure Secrets

```bash
# OpenPhone credentials
wrangler secret put OPENPHONE_API_KEY
wrangler secret put OPENPHONE_WEBHOOK_SECRET

# Database
wrangler secret put NEON_DATABASE_URL

# ChittyOS service tokens
wrangler secret put CHITTY_ID_SERVICE_TOKEN
wrangler secret put CHITTY_AUTH_SERVICE_TOKEN
wrangler secret put CHITTY_CONNECT_SERVICE_TOKEN

# Security
wrangler secret put JWT_SECRET
wrangler secret put ENCRYPTION_KEY
```

Verify all secrets:
```bash
wrangler secret list
```

### 4. Create KV Namespaces

```bash
# Production
wrangler kv:namespace create RECEPTION_KV

# Preview (for dev)
wrangler kv:namespace create RECEPTION_KV --preview
```

Update `wrangler.toml` with the IDs returned.

### 5. Update Configuration Files

**`config/business-rules.json`:**
```json
{
  "company": {
    "phone": "+1-312-XXX-XXXX",  // Your actual phone
    "email": "info@chicagofurnishedcondos.com"
  }
}
```

**`config/sona-personality.txt`:**
Replace `<ON_CALL_PHONE>` with your 24/7 emergency number.

## Deployment

### Staging Deployment

```bash
# Type check
npm run typecheck

# Deploy to staging
npm run deploy:staging

# View logs
npm run tail
```

**Staging URL:** `https://chittyreception-staging.workers.dev`

### Production Deployment

```bash
# Final verification
npm run typecheck
npm run test

# Deploy to production
npm run deploy:production
```

**Production URL:** `https://reception.chitty.cc` (requires custom domain setup)

## OpenPhone Configuration

### 1. Set Webhook URL

**In OpenPhone Dashboard:**
- Go to Settings → Webhooks
- Create webhook: `https://reception.chitty.cc/webhooks/openphone`
- Subscribe to events:
  - ✅ `call.initiated`
  - ✅ `call.completed`
  - ✅ `message.created`
  - ✅ `voicemail.created`

### 2. Test Webhook

Send test SMS to your OpenPhone number:
```
"Hi, I need a 1BR in River North for 3 months"
```

Check logs for processing:
```bash
npm run tail -- --search "message.created"
```

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://reception.chitty.cc/api/v1/health
```

Expected response:
```json
{
  "success": true,
  "service": "chittyreception",
  "status": "healthy",
  "timestamp": "2025-01-04T..."
}
```

### 2. Test Authenticated Endpoint

```bash
# Get token from ChittyAuth
TOKEN="your_api_token"

# Send test message
curl -X POST https://reception.chitty.cc/api/v1/send-message \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+15551234567",
    "to": ["+15559876543"],
    "content": "Test from ChittyReception"
  }'
```

### 3. Test Sona AI

```bash
# Visit test interface
open https://reception.chitty.cc/sona/test

# Or test via API
curl -X POST https://reception.chitty.cc/sona/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need a 1BR for 3 months",
    "sessionId": "test-123"
  }'
```

### 4. Verify Database Integration

```bash
# Check calls table
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM reception_calls;"

# Check messages table
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM reception_messages;"

# View recent activity
psql "$NEON_DATABASE_URL" -c "
  SELECT * FROM reception_calls
  ORDER BY created_at DESC
  LIMIT 5;
"
```

## Custom Domain Setup

### 1. Add Domain in Cloudflare Dashboard

- Go to Workers & Pages → chittyreception-production
- Custom Domains → Add Custom Domain
- Enter: `reception.chitty.cc`
- Cloudflare will auto-configure DNS

### 2. Verify DNS

```bash
dig reception.chitty.cc
# Should return Cloudflare Workers IP
```

### 3. Update OpenPhone Webhook

Change webhook URL from:
- `https://chittyreception-production.workers.dev/webhooks/openphone`

To:
- `https://reception.chitty.cc/webhooks/openphone`

## Register with ChittyRegistry

```bash
curl -X POST https://registry.chitty.cc/api/v1/register \
  -H "Authorization: Bearer $REGISTRY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "service": "chittyreception",
    "version": "1.0.0",
    "endpoint": "https://reception.chitty.cc",
    "health_check": "https://reception.chitty.cc/api/v1/health",
    "capabilities": [
      "phone",
      "sms",
      "voicemail",
      "ai-orchestration",
      "booking-validation",
      "emergency-routing"
    ],
    "metadata": {
      "provider": "openphone",
      "ai_model": "llama-3.1-8b-instruct",
      "business_rules": "chicago_furnished_condos"
    }
  }'
```

## Monitoring Setup

### 1. Enable Cloudflare Analytics

- Workers & Pages → Analytics
- Enable real-time logs
- Set up alerts for errors

### 2. Database Monitoring

Create view for admin dashboard:
```sql
CREATE VIEW reception_metrics AS
SELECT
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as calls_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as calls_7d,
  AVG(duration_seconds) FILTER (WHERE status = 'completed') as avg_duration,
  COUNT(DISTINCT identity_id) as unique_callers
FROM reception_calls;
```

### 3. Set Up Alerts

**Cloudflare Workers:**
- Error rate > 5%
- Latency > 2 seconds
- Request volume spike

**Database:**
- Connection failures
- Slow queries (> 1 second)
- Table size growth

## Backup & Recovery

### Database Backups

Neon automatically backs up your database. To export manually:

```bash
# Export all ChittyReception tables
pg_dump "$NEON_DATABASE_URL" \
  --table=reception_calls \
  --table=reception_messages \
  --table=identity_phones \
  --table=reception_sessions \
  > chittyreception_backup_$(date +%Y%m%d).sql
```

### Configuration Backup

```bash
# Backup secrets (encrypted)
wrangler secret list > secrets_list.txt

# Backup KV data
wrangler kv:key list --namespace-id=your-kv-id > kv_backup.json
```

## Rollback Procedure

If deployment fails:

```bash
# 1. Rollback Workers deployment
wrangler rollback

# 2. Check previous version
wrangler deployments list

# 3. Or redeploy previous version
git checkout <previous-commit>
npm run deploy:production

# 4. Update OpenPhone webhook if needed
```

## Performance Tuning

### 1. Enable Caching

Update code to cache knowledge base:
```typescript
// Cache KB responses in KV for 24 hours
await env.RECEPTION_KV.put(
  `kb:${question}`,
  answer,
  { expirationTtl: 86400 }
);
```

### 2. Database Connection Pooling

Neon serverless driver handles this automatically.

### 3. AI Response Caching

Cache common intents:
```typescript
const cacheKey = `intent:${hash(userMessage)}`;
const cached = await env.RECEPTION_KV.get(cacheKey);
if (cached) return JSON.parse(cached);
```

## Security Checklist

- [x] All secrets stored in Wrangler (not in code)
- [x] Database uses SSL connections (Neon default)
- [x] OpenPhone webhooks verified with signature
- [x] API endpoints require authentication
- [x] Tokens hashed with SHA-256
- [x] No sensitive data in logs
- [x] CORS configured properly
- [x] Rate limiting (Cloudflare default)

## Troubleshooting

### Issue: Webhooks not receiving

**Check:**
1. OpenPhone webhook URL is correct
2. Webhook signature verification
3. Cloudflare Workers logs: `npm run tail`
4. Network connectivity

**Debug:**
```bash
# Test webhook directly
curl -X POST https://reception.chitty.cc/webhooks/openphone \
  -H "X-OpenPhone-Signature: test" \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_test","type":"message.created","data":{}}'

# Check logs
npm run tail -- --search "webhook"
```

### Issue: Database connection errors

**Check:**
1. `NEON_DATABASE_URL` secret is set
2. Database is accessible from Cloudflare
3. Tables exist: `psql "$NEON_DATABASE_URL" -c "\dt reception_*"`

**Debug:**
```bash
# Test connection
psql "$NEON_DATABASE_URL" -c "SELECT 1"

# Check secret
wrangler secret list | grep NEON
```

### Issue: AI responses slow

**Check:**
1. Workers AI timeout (max 30 seconds)
2. Prompt size
3. Response caching

**Optimize:**
- Reduce prompt size
- Cache common responses
- Use streaming where possible

### Issue: Authentication failing

**Check:**
1. Token format: `Bearer {token}`
2. Token exists in database: `SELECT * FROM api_tokens WHERE token_hash = 'xxx'`
3. Token not expired
4. Token status = 'active'

**Debug:**
```bash
# Test auth manually
TOKEN="your_token"
HASH=$(echo -n "$TOKEN" | openssl sha256 | awk '{print $2}')
psql "$NEON_DATABASE_URL" -c "
  SELECT * FROM api_tokens WHERE token_hash = '$HASH'
"
```

## Maintenance Schedule

**Daily:**
- Review error logs
- Check webhook processing rate
- Monitor response times

**Weekly:**
- Review conversation transcripts
- Update knowledge base
- Check database performance

**Monthly:**
- Review business rules
- Update pricing/policies
- Analyze conversion metrics
- Database maintenance (VACUUM, ANALYZE)

**Quarterly:**
- Security audit
- Performance review
- Cost optimization
- Feature roadmap

## Support Contacts

- **OpenPhone Support:** support@openphone.com
- **Cloudflare Workers:** https://developers.cloudflare.com/workers
- **Neon Database:** https://neon.tech/docs
- **ChittyOS Issues:** https://github.com/chittyos/issues

## Success Metrics

Track these KPIs:

1. **Response Rate:** % of calls/SMS answered by Sona
2. **Completion Rate:** % of conversations that collect all info
3. **Transfer Rate:** % requiring human intervention (<10% goal)
4. **Lead Conversion:** % of inquiries that book
5. **Response Time:** Average time to first response (<2 sec goal)
6. **Error Rate:** % of failed requests (<1% goal)
7. **Customer Satisfaction:** Based on follow-up surveys

---

**Deployment completed:** Ready for production
**Estimated deployment time:** 30-60 minutes
**Next review:** 48 hours after deployment
