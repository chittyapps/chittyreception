#!/bin/bash

# ChittyReception Production Deployment Script
# This script deploys ChittyReception to production after verifying all prerequisites

set -e  # Exit on error

echo "========================================="
echo "ChittyReception Production Deployment"
echo "========================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Safety check - confirm production deployment
echo -e "${RED}WARNING: You are about to deploy to PRODUCTION${NC}"
echo -e "${YELLOW}This will affect live traffic and customer calls${NC}"
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Deployment cancelled"
  exit 0
fi

# Step 1: Verify TypeScript compilation
echo -e "${YELLOW}Step 1: Running TypeScript type check...${NC}"
npm run typecheck
echo -e "${GREEN}✓ Type check passed${NC}"
echo ""

# Step 2: Check if all secrets are set
echo -e "${YELLOW}Step 2: Verifying production secrets...${NC}"
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

CURRENT_SECRETS=$(wrangler secret list --env production 2>/dev/null | grep -v WARNING | jq -r '.[].name' || echo "")
MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
  if ! echo "$CURRENT_SECRETS" | grep -q "^$secret$"; then
    MISSING_SECRETS+=("$secret")
  fi
done

if [ ${#MISSING_SECRETS[@]} -gt 0 ]; then
  echo -e "${RED}✗ Missing secrets in production environment:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  - $secret"
  done
  echo ""
  echo -e "${YELLOW}Please set missing secrets before deploying:${NC}"
  for secret in "${MISSING_SECRETS[@]}"; do
    echo "  wrangler secret put $secret --env production"
  done
  exit 1
else
  echo -e "${GREEN}✓ All required secrets are set${NC}"
fi
echo ""

# Step 3: Verify staging is healthy
echo -e "${YELLOW}Step 3: Verifying staging deployment...${NC}"
STAGING_HEALTH=$(curl -s https://chittyreception-staging.ccorp.workers.dev/api/v1/health || echo "error")
if echo "$STAGING_HEALTH" | grep -q "healthy"; then
  echo -e "${GREEN}✓ Staging is healthy${NC}"
else
  echo -e "${RED}✗ Staging health check failed${NC}"
  echo "Response: $STAGING_HEALTH"
  read -p "Continue anyway? (yes/no): " continue_anyway
  if [ "$continue_anyway" != "yes" ]; then
    echo "Deployment cancelled"
    exit 1
  fi
fi
echo ""

# Step 4: Build the project
echo -e "${YELLOW}Step 4: Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 5: Deploy to production
echo -e "${YELLOW}Step 5: Deploying to production...${NC}"
npm run deploy:production
echo -e "${GREEN}✓ Deployment completed${NC}"
echo ""

# Step 6: Verify production deployment
echo -e "${YELLOW}Step 6: Verifying production deployment...${NC}"
sleep 3  # Wait for deployment to propagate
PROD_HEALTH=$(curl -s https://chittyreception-production.ccorp.workers.dev/api/v1/health || echo "error")
if echo "$PROD_HEALTH" | grep -q "healthy"; then
  echo -e "${GREEN}✓ Production is healthy${NC}"
else
  echo -e "${RED}✗ Production health check failed${NC}"
  echo "Response: $PROD_HEALTH"
  echo ""
  echo -e "${YELLOW}Check logs immediately:${NC}"
  echo "  npm run tail -- --env production"
fi
echo ""

# Step 7: Display deployment info
echo "========================================="
echo -e "${GREEN}Production Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "Service URL: https://chittyreception-production.ccorp.workers.dev"
echo ""
echo "Post-deployment checklist:"
echo "1. Configure OpenPhone webhook to point to production"
echo "2. Test end-to-end call flow"
echo "3. Verify MCP integration:"
echo "   curl https://chittyreception-production.ccorp.workers.dev/mcp/tools"
echo "4. Monitor logs for the first hour:"
echo "   npm run tail -- --env production"
echo "5. Update Claude Desktop config if needed"
echo ""
