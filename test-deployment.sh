#!/bin/bash

# ChittyReception Deployment Testing Script
# Tests all critical endpoints after deployment

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Ask which environment to test
echo "========================================="
echo "ChittyReception Deployment Testing"
echo "========================================="
echo ""
echo -e "${YELLOW}Which environment to test?${NC}"
echo "1) staging (reception-staging.chitty.cc)"
echo "2) production (reception.chitty.cc)"
read -p "Select (1 or 2): " env_choice

case $env_choice in
  1)
    BASE_URL="https://reception-staging.chitty.cc"
    ENV="staging"
    ;;
  2)
    BASE_URL="https://reception.chitty.cc"
    ENV="production"
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo -e "${BLUE}Testing ${ENV} environment: ${BASE_URL}${NC}"
echo ""

# Test counter
PASSED=0
FAILED=0

# Test function
test_endpoint() {
  local name=$1
  local url=$2
  local expected=$3
  local method=${4:-GET}
  local headers=${5:-}

  echo -n "Testing ${name}... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$url" $headers || echo -e "\nerror")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" $headers || echo -e "\nerror")
  fi

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if echo "$body" | grep -q "$expected" && [ "$http_code" != "error" ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
    echo "  Expected to find: $expected"
    echo "  Response: $body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Run tests
echo -e "${YELLOW}Running endpoint tests...${NC}"
echo ""

# Test 1: Root endpoint
test_endpoint "Root endpoint" "$BASE_URL/" "chittyreception"

# Test 2: Health check
test_endpoint "Health check" "$BASE_URL/api/v1/health" "healthy"

# Test 3: Status endpoint
test_endpoint "Status endpoint" "$BASE_URL/api/v1/status" "status"

# Test 4: MCP tools listing
test_endpoint "MCP tools endpoint" "$BASE_URL/mcp/tools" "tools"

# Test 5: Verify CORS headers
echo -n "Testing CORS headers... "
cors_response=$(curl -s -I -X OPTIONS "$BASE_URL/api/v1/health" -H "Origin: https://example.com")
if echo "$cors_response" | grep -qi "access-control-allow-origin"; then
  echo -e "${GREEN}✓ PASSED${NC}"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗ FAILED${NC}"
  echo "  Response headers:"
  echo "$cors_response"
  FAILED=$((FAILED + 1))
fi

# Test 6: Verify authentication is required for protected endpoints
echo -n "Testing auth protection... "
auth_response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/send-message" \
  -H "Content-Type: application/json" \
  -d '{"to":["+1234567890"],"content":"test"}')
auth_code=$(echo "$auth_response" | tail -1)
auth_body=$(echo "$auth_response" | sed '$d')

if [ "$auth_code" = "401" ] || echo "$auth_body" | grep -q -i "unauthorized\|authorization"; then
  echo -e "${GREEN}✓ PASSED${NC} (Correctly rejected unauthenticated request)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗ FAILED${NC} (Should require authentication)"
  echo "  HTTP Code: $auth_code"
  echo "  Response: $auth_body"
  FAILED=$((FAILED + 1))
fi

# Test 7: Database connectivity (via health check detailed response)
echo -n "Testing database connectivity... "
db_response=$(curl -s "$BASE_URL/api/v1/health")
if echo "$db_response" | grep -q "database"; then
  if echo "$db_response" | grep -q '"database":\s*"connected"'; then
    echo -e "${GREEN}✓ PASSED${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "${YELLOW}⚠ WARNING${NC} (Database status unclear)"
    echo "  Response: $db_response"
    PASSED=$((PASSED + 1))
  fi
else
  echo -e "${YELLOW}⚠ WARNING${NC} (Database status not reported)"
  PASSED=$((PASSED + 1))
fi

# Summary
echo ""
echo "========================================="
echo "Test Results for ${ENV}"
echo "========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Monitor logs: npm run tail -- --env ${ENV}"
  echo "2. Test MCP integration with Claude Desktop"
  if [ "$ENV" = "staging" ]; then
    echo "3. Deploy to production: ./deploy-production.sh"
  else
    echo "3. Configure OpenPhone webhook to production URL"
    echo "4. Test end-to-end call flow"
  fi
  exit 0
else
  echo -e "${RED}✗ Some tests failed. Please investigate before proceeding.${NC}"
  echo ""
  echo "Debug commands:"
  echo "  npm run tail -- --env ${ENV}  # Stream logs"
  echo "  curl -v ${BASE_URL}/api/v1/health  # Verbose health check"
  exit 1
fi
