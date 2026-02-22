# ChittyReception Charter

## Classification
- **Canonical URI**: `chittycanon://core/services/chittyreception`
- **Tier**: 5 (Application)
- **Organization**: chittyapps
- **Domain**: chittyreception.chitty.cc

## Mission

Reception and intake service for the ChittyOS ecosystem. Handles initial contact, intake forms, and client onboarding.

## Scope

### IS Responsible For
- Client intake, onboarding, reception management

### IS NOT Responsible For
- Identity generation (ChittyID)
- Token provisioning (ChittyAuth)

## Dependencies

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | ChittyAuth | Authentication |

## API Contract

**Base URL**: https://chittyreception.chitty.cc

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health |

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | chittyapps |

## Compliance

- [ ] Registered in ChittyRegister
- [ ] Health endpoint operational at /health
- [ ] CLAUDE.md present
- [ ] CHARTER.md present
- [ ] CHITTY.md present

---
*Charter Version: 1.0.0 | Last Updated: 2026-02-21*