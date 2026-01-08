#!/bin/bash

# ChittyReception Secret Management Script
# Helps set secrets for staging and production environments

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "========================================="
echo "ChittyReception Secret Management"
echo "========================================="
echo ""

# Ask which environment
echo -e "${YELLOW}Which environment?${NC}"
echo "1) staging"
echo "2) production"
read -p "Select (1 or 2): " env_choice

case $env_choice in
  1)
    ENV="staging"
    ;;
  2)
    ENV="production"
    ;;
  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo -e "${BLUE}Setting secrets for ${ENV} environment${NC}"
echo ""

# Required secrets
SECRETS=(
  "OPENPHONE_API_KEY"
  "OPENPHONE_WEBHOOK_SECRET"
  "NEON_DATABASE_URL"
  "JWT_SECRET"
  "ENCRYPTION_KEY"
  "CHITTY_ID_SERVICE_TOKEN"
  "CHITTY_AUTH_SERVICE_TOKEN"
  "CHITTY_CONNECT_SERVICE_TOKEN"
)

# Check current secrets
echo -e "${YELLOW}Current secrets in ${ENV}:${NC}"
wrangler secret list --env "$ENV" 2>/dev/null | grep -v WARNING || echo "None"
echo ""

# Ask which action
echo -e "${YELLOW}What would you like to do?${NC}"
echo "1) Set all missing secrets"
echo "2) Set specific secret"
echo "3) Copy all secrets from default environment"
read -p "Select (1, 2, or 3): " action_choice

case $action_choice in
  1)
    # Set all missing secrets
    CURRENT_SECRETS=$(wrangler secret list --env "$ENV" 2>/dev/null | grep -v WARNING | jq -r '.[].name' || echo "")

    for secret in "${SECRETS[@]}"; do
      if ! echo "$CURRENT_SECRETS" | grep -q "^$secret$"; then
        echo ""
        echo -e "${YELLOW}Setting $secret...${NC}"
        wrangler secret put "$secret" --env "$ENV"
      else
        echo -e "${GREEN}✓ $secret already set${NC}"
      fi
    done
    ;;

  2)
    # Set specific secret
    echo ""
    echo -e "${YELLOW}Available secrets:${NC}"
    for i in "${!SECRETS[@]}"; do
      echo "$((i+1))) ${SECRETS[$i]}"
    done
    read -p "Select secret number: " secret_choice

    if [ "$secret_choice" -ge 1 ] && [ "$secret_choice" -le "${#SECRETS[@]}" ]; then
      selected_secret="${SECRETS[$((secret_choice-1))]}"
      echo ""
      echo -e "${YELLOW}Setting $selected_secret...${NC}"
      wrangler secret put "$selected_secret" --env "$ENV"
    else
      echo "Invalid choice"
      exit 1
    fi
    ;;

  3)
    # Copy from default environment
    echo ""
    echo -e "${YELLOW}This will copy secrets from default environment to ${ENV}${NC}"
    echo -e "${RED}Note: You'll need to paste each value when prompted${NC}"
    read -p "Continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
      echo "Cancelled"
      exit 0
    fi

    echo ""
    echo "For each secret, retrieve the value from your default environment and paste it when prompted."
    echo ""

    for secret in "${SECRETS[@]}"; do
      echo -e "${YELLOW}Setting $secret for ${ENV}...${NC}"
      wrangler secret put "$secret" --env "$ENV"
      echo ""
    done
    ;;

  *)
    echo "Invalid choice"
    exit 1
    ;;
esac

echo ""
echo -e "${GREEN}Secrets updated successfully!${NC}"
echo ""
echo "Current secrets in ${ENV}:"
wrangler secret list --env "$ENV" 2>/dev/null | grep -v WARNING
echo ""
