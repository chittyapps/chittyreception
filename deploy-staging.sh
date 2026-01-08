#!/bin/bash

# ChittyReception Staging Deployment Script
# This script deploys ChittyReception to staging after verifying all prerequisites

set -e  # Exit on error

echo "========================================="
echo "ChittyReception Staging Deployment"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Verify TypeScript compilation
echo -e "${YELLOW}Step 1: Running TypeScript type check...${NC}"
npm run typecheck
echo -e "${GREEN}✓ Type check passed${NC}"
echo ""

# Step 2: Check if all secrets are set
echo -e "${YELLOW}Step 2: Verifying staging secrets...${NC}"
REQUIRED_SECRETS=(
  "OPENPHONE_API_KEY"
  "OPENPHONE_WEBHOOK_SECRET"
  "NEON_DATABASE_URL"
  "JWT_SECRET"
  "ENCRYPTION_KEY"
  "CHITTY_ID_SERVICE_TOKEN"
  "CHITTY_AUTH_SERVICE_TOKEN"
  "CHITTY_CONNECT_SERVICE_TOKEN"
)

CURRENT_SECRETS=$(wrangler secret list --env staging 2>/dev/null | grep -v WARNING | jq -r '.[].name' || echo "")
MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
  if ! echo "$CURRENT_SECRETS" | grep -q "^$secret$"; then
    MISSING_SECRETS+=("$secret")
  fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing secrets in staging environment:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  - $secret"
  done
  echo ""
  echo -e "${YELLOW}Please set missing secrets before deploying:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  wrangler secret put $secret --env staging"
  done
  exit 1
else
  echo -e "${GREEN}✓ All required secrets are set${NC}"
fi
echo ""

# Step 3: Build the project
echo -e "${YELLOW}Step 3: Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 4: Deploy to staging
echo -e "${YELLOW}Step 4: Deploying to staging...${NC}"
npm run deploy:staging
echo -e "${GREEN}✓ Deployment completed${NC}"
echo ""

# Step 5: Display deployment info
echo "========================================="
echo -e "${GREEN}Deployment Successful!${NC}"
echo "========================================="
echo ""
echo "Service URL: https://chittyreception-staging.ccorp.workers.dev"
echo ""
echo "Next steps:"
echo "1. Test health endpoint:"
echo "   curl https://chittyreception-staging.ccorp.workers.dev/api/v1/health"
echo ""
echo "2. Test MCP tools endpoint:"
echo "   curl https://chittyreception-staging.ccorp.workers.dev/mcp/tools"
echo ""
echo "3. Stream logs:"
echo "   npm run tail -- --env staging"
echo ""
echo "4. Once verified, deploy to production:"
echo "   ./deploy-production.sh"
echo ""
