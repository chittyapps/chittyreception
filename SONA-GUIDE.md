# Sona AI Concierge Configuration Guide

Complete guide for Chicago Furnished Condos' AI-powered answering service.

## What's Been Configured

### Business Rules Enforcement
Located in `config/business-rules.json`, enforces:

#### Booking Constraints
- **32+ day minimum** (Chicago compliance)
- **30-31 day exception** with vacancy pressure approval
- **Month boundary preference** (1st to last of month)
- **7-day advance notice** minimum
- **No same-day bookings**

#### Pricing Structure
- Studio: $2,200 - $2,800/month
- 1BR: $2,800 - $3,800/month
- 2BR: $3,800 - $5,500/month
- 3BR: $5,500 - $8,000/month

**Length-of-stay discounts:**
- 3+ months: 5% off
- 6+ months: 10% off
- 12+ months: 15% off

#### Fees & Deposits
- **Security deposit:** One month rent (refundable)
- **Cleaning fee:** $150-$350 by unit size (waived for 6+ months)
- **Pet fees:** $500 deposit + $75/month per pet
- **Parking:** $250/month (not included)
- **Utilities:** Included (capped at $150/month)

#### Pet Policy
- **Allowed:** Cats and dogs
- **Maximum:** 2 pets, 50 lbs each
- **Restrictions:** Pit Bulls, Rottweilers, Dobermans
- **Required:** Vaccination records, photos, vet reference

#### Corporate Housing
- **Minimum:** 2 units, 6 month commitment
- **Benefits:** Volume discounts (8-12%), dedicated account manager, Net 30 terms
- **Required:** Master Service Agreement

### AI Personality
Located in `config/sona-personality.txt`:

- Professional yet warm concierge tone
- Firm on policies but empathetic
- Efficient information gathering
- Clear escalation paths
- Never collects payment info over phone

### Knowledge Base
Located in `config/knowledge-base.jsonl`:

40+ Q&A pairs covering:
- Booking policies and minimums
- Pricing and discounts
- Pet policies and fees
- Utilities, parking, housekeeping
- Cancellation and refund policies
- Maintenance and emergencies
- Corporate housing programs
- Check-in/out procedures

### Validation Logic
Located in `src/lib/booking-validator.ts`:

**Validates:**
- Stay duration (32+ days required)
- Month boundary alignment
- Advance notice requirements
- Pet restrictions
- Corporate minimums

**Calculates:**
- Estimated pricing with discounts
- Fees and deposits
- Total costs with breakdown

**Provides:**
- Error messages for invalid requests
- Warnings for exceptions
- Suggestions for alternatives

### AI Orchestration
Located in `src/lib/ai-orchestrator.ts`:

**Identifies intents:**
- `booking_inquiry` - New reservation requests
- `existing_reservation` - Current guest questions
- `corporate_housing` - Business accounts
- `maintenance_emergency` - Immediate transfer required
- `maintenance_non_emergency` - Create ticket
- `general_question` - Knowledge base lookup

**Routes appropriately:**
- **Transfer immediately:** Emergencies (no heat, water leaks, lockouts)
- **Collect info:** Booking details, contact info
- **Validate:** Check dates, apply business rules
- **Quote:** Provide pricing estimates
- **Escalate:** Complex requests requiring approval

## How to Use

### 1. OpenPhone Integration

When a call or SMS comes in via OpenPhone webhook:

```
OpenPhone → /webhooks/openphone → Stores in KV → Triggers Sona
```

The webhook handler in `src/routes/webhooks.ts` processes:
- Incoming calls → Routes to Sona for triage
- Messages → Analyzes and responds via Sona
- Voicemails → Transcribes and processes

### 2. Sona Chat Interface

**Endpoint:** `POST /sona/chat`

**Request:**
```json
{
  "message": "I need a furnished 1BR in River North for 3 months",
  "sessionId": "unique-session-id",
  "context": {
    "conversationHistory": []
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Great! Three months qualifies for our 5% length-of-stay discount...",
    "intent": "booking_inquiry",
    "action": "collect_info",
    "nextStep": "dates"
  }
}
```

### 3. Test Interface

**Visit:** `GET /sona/test`

Opens interactive chat UI for testing Sona responses:
- Type messages as if calling
- See intent detection
- Test business rule enforcement
- Verify personality consistency

### 4. Conversation Flow Examples

#### Booking Inquiry (Valid)
```
User: "I need a 1BR from April 1 to June 30"
Sona: "Great! Those dates work well with our rental cycle (first to last of month).
       That's 3 months, which qualifies for our 5% discount.

       Estimated pricing for a 1BR:
       - Monthly Rate: $3,040 (5% discount applied)
       - Duration: 3.0 months
       - Total Rent: $9,120
       - Security Deposit: $3,040 (refundable)

       To get exact availability in River North, can I get your name, phone, and email?"
```

#### Booking Inquiry (Too Short)
```
User: "I need a place for 2 weeks"
Sona: "Our minimum stay is 32 days for Chicago compliance.
       Your requested stay is 14 days. We can't accommodate stays under 30 days.

       Consider extending to 32+ days, or if you need exactly 30-31 days,
       we may be able to help if we have vacancy. Would a longer stay work for you?"
```

#### Booking Inquiry (Mid-Month)
```
User: "Can I check in March 15 and check out May 10?"
Sona: "Our standard rental cycle runs first of the month to last of the month.
       Mid-month dates may be possible if we have availability.

       Consider March 1 to April 30 to align with our standard monthly cycle.
       That would be 2 months. Would that work, or should I check if your
       exact dates are available?"
```

#### Emergency Maintenance
```
User: "The heat isn't working and it's 30 degrees outside"
Sona: "That's an emergency. Let me connect you to our on-call team right now."
[TRANSFERS to emergency line]
```

#### Pet Inquiry
```
User: "Do you allow dogs? I have a 40-pound golden retriever"
Sona: "Yes, we allow dogs! Your 40-pound golden retriever would be fine.
       Pet fees are $500 deposit (partially refundable) plus $75 per month.
       We'll need vaccination records, photos, and a vet reference.
       Maximum 2 pets, 50 pounds each.

       Would you like to proceed with a booking inquiry?"
```

## Configuration Checklist

### Required Placeholders to Replace

1. **Emergency Phone Number**
   - File: `config/sona-personality.txt`
   - Replace: `<ON_CALL_PHONE>`
   - With: Your 24/7 emergency maintenance number

2. **Company Phone**
   - File: `config/business-rules.json`
   - Field: `company.phone`
   - Set to: Your main office number

3. **Company Email**
   - File: `config/business-rules.json`
   - Field: `company.email`
   - Set to: info@chicagofurnishedcondos.com

4. **Webhook URLs** (for jobs/automation)
   - Lead capture webhook
   - Availability API
   - Ticketing system
   - Calendar/scheduling

### Environment Variables

Add to `.env` and Wrangler secrets:

```bash
# OpenPhone
OPENPHONE_API_KEY=your_key
OPENPHONE_WEBHOOK_SECRET=your_secret

# Emergency contact (for transfers)
EMERGENCY_MAINTENANCE_PHONE=+15551234567
```

## Testing Scenarios

### Test 1: Valid 32+ Day Booking
```
"I need a 1BR in River North from February 1 to March 31"
Expected: Quote with pricing, collect contact info
```

### Test 2: Too Short Stay
```
"Can I rent for 3 weeks?"
Expected: Politely decline, explain 32-day minimum
```

### Test 3: 30-Day Edge Case
```
"I need 30 days exactly, is that possible?"
Expected: Explain below minimum, mention vacancy exception, collect info for approval
```

### Test 4: Mid-Month Dates
```
"Check in January 15, check out March 10"
Expected: Suggest month boundaries, offer to check specific dates
```

### Test 5: Emergency
```
"There's water leaking everywhere!"
Expected: Immediate transfer to emergency line
```

### Test 6: Pets
```
"I have 3 cats, is that okay?"
Expected: Explain 2-pet maximum, collect info if willing to reduce
```

### Test 7: Corporate Inquiry
```
"We need housing for 5 employees for 6 months"
Expected: Explain corporate program, collect company details
```

### Test 8: Pricing Question
```
"How much does a 2BR cost?"
Expected: Give range ($3,800-$5,500), explain discounts, offer to get exact pricing
```

### Test 9: Existing Reservation
```
"I need my access code, reservation 8K3Q"
Expected: Request identity verification first (last name + phone)
```

### Test 10: Extension Request
```
"Can I extend my stay by 2 months?"
Expected: Collect reservation details, explain extension possible subject to availability
```

## Customization

### Adjust Minimum Stay
Edit `config/business-rules.json`:
```json
"minimum_stay": {
  "days": 30,  // Change from 32
  ...
}
```

### Change Pricing
Edit `config/business-rules.json`:
```json
"base_rates": {
  "one_bedroom": {
    "min": 3000,  // Increase minimum
    "max": 4000,  // Increase maximum
    "avg": 3500
  }
}
```

### Modify Discounts
Edit `config/business-rules.json`:
```json
"discounts": {
  "length_of_stay": {
    "3_months": 8,  // Increase from 5%
    "6_months": 12,  // Increase from 10%
    "12_months": 20  // Increase from 15%
  }
}
```

### Update Pet Policy
Edit `config/business-rules.json`:
```json
"pets": {
  "allowed": true,
  "restrictions": {
    "max_weight": 75,  // Increase from 50
    "max_count": 3,    // Increase from 2
    ...
  }
}
```

### Add Knowledge Base Entries
Edit `config/knowledge-base.jsonl`, add lines:
```json
{"question": "Your new question?", "answer": "Your answer here."}
```

## Integration Points

### Lead Capture
When Sona collects booking inquiry info, trigger:
- Webhook to Google Sheets / Airtable
- Email to leasing team
- SMS notification

### Availability Check
When user provides dates, call:
- Your PMS API
- Google Sheets with availability
- Custom availability service

### Maintenance Tickets
When non-emergency maintenance, create:
- Ticket in your system
- Email to maintenance team
- Calendar event for follow-up

### CRM Integration
Push completed conversations to:
- Salesforce
- HubSpot
- Custom CRM

## Monitoring & Improvement

### Key Metrics to Track
- Conversion rate (inquiry → booking)
- Average response time
- Transfer rate (should be low)
- Intent accuracy
- Policy violation rate

### Conversation Review
Regularly review transcripts for:
- Missed intents
- Incorrect policy applications
- Tone improvements
- New FAQ topics

### Knowledge Base Updates
Add new Q&A pairs when you see:
- Repeated questions Sona struggles with
- New policies or procedures
- Common objections or concerns

## Support

For issues or questions:
- Review logs: `npm run tail`
- Test locally: `npm run dev` → visit `/sona/test`
- Check validation: Test edge cases with booking validator
- Update personality: Edit `config/sona-personality.txt`
