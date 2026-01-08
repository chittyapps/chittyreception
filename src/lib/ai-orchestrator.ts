// AI Orchestration for intelligent call/message routing and response

import type { Env } from '@/types/env';
import { validateBooking, calculatePricing, type BookingRequest } from './booking-validator';
import businessRules from '../../config/business-rules.json';

export interface ConversationContext {
  intent?: string;
  entities?: Record<string, any>;
  slots?: {
    checkIn?: string;
    checkOut?: string;
    unitType?: string;
    neighborhood?: string;
    guestCount?: number;
    petCount?: number;
    corporateBooking?: boolean;
    name?: string;
    phone?: string;
    email?: string;
  };
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface OrchestratorResponse {
  message: string;
  intent: string;
  action?: 'transfer' | 'escalate' | 'collect_info' | 'quote' | 'complete';
  transferNumber?: string;
  nextStep?: string;
  validationResult?: any;
  pricingEstimate?: any;
}

/**
 * Main AI orchestration function
 * Analyzes user input and determines appropriate response/action
 */
export async function orchestrateResponse(
  userMessage: string,
  context: ConversationContext,
  env: Env
): Promise<OrchestratorResponse> {
  // Build system prompt with business rules
  const systemPrompt = buildSystemPrompt();

  // Build conversation history
  const messages = [
    { role: 'system', content: systemPrompt },
    ...(context.conversationHistory || []),
    { role: 'user', content: userMessage },
  ];

  // Call AI to analyze intent and extract entities
  // @ts-ignore - Model name is valid but may not be in type definitions
  const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages,
    max_tokens: 500,
  });

  // Parse AI response and determine action
  const analysis = parseAIResponse(aiResponse);

  // Check for emergency keywords
  if (isEmergency(userMessage)) {
    return {
      message: "That's an emergency situation. Let me connect you to our on-call maintenance team right now.",
      intent: 'maintenance_emergency',
      action: 'transfer',
      transferNumber: businessRules.company.phone, // Replace with actual on-call number
    };
  }

  // Handle booking inquiry with validation
  if (analysis.intent === 'booking_inquiry' && context.slots?.checkIn && context.slots?.checkOut) {
    return handleBookingInquiry(context);
  }

  // Handle existing reservation
  if (analysis.intent === 'existing_reservation') {
    return {
      message: "I can help with that. For security, I'll need to verify your identity first. Can you provide your last name and the phone number on the reservation?",
      intent: 'existing_reservation',
      action: 'collect_info',
      nextStep: 'verify_identity',
    };
  }

  // Handle corporate inquiry
  if (analysis.intent === 'corporate_housing') {
    return {
      message: `We'd love to help with your corporate housing needs. We work with companies placing 2 or more employees for 6+ months, and offer dedicated account management and volume discounts. Can I get some details: how many units do you need, for approximately how long, and which neighborhoods interest you?`,
      intent: 'corporate_housing',
      action: 'collect_info',
      nextStep: 'corporate_details',
    };
  }

  // Handle maintenance request
  if (analysis.intent === 'maintenance') {
    return handleMaintenanceRequest(userMessage);
  }

  // Handle general questions (knowledge base lookup)
  if (analysis.intent === 'general_question') {
    const answer = await lookupKnowledgeBase(userMessage, env);
    return {
      message: answer,
      intent: 'general_question',
      action: 'complete',
    };
  }

  // Default: ask for clarification
  return {
    message: "I want to make sure I help you with the right thing. Are you calling about booking a new stay, an existing reservation, corporate housing, maintenance, or general information?",
    intent: 'clarification_needed',
    action: 'collect_info',
  };
}

/**
 * Build system prompt with business rules
 */
function buildSystemPrompt(): string {
  return `You are Sona, virtual concierge for Chicago Furnished Condos.

CRITICAL BUSINESS RULES:
- Minimum stay: ${businessRules.booking_policies.minimum_stay.days} days (32+ days required for Chicago compliance)
- Exception: 30-31 days may be possible with vacancy pressure
- Standard rental cycle: First of month to last of month
- Advance notice: ${businessRules.booking_policies.advance_booking.minimum_notice_days} days minimum
- Same-day bookings: NOT POSSIBLE

PRICING RANGES (give ranges, not exact):
- Studio: $${businessRules.pricing.base_rates.studio.min}-$${businessRules.pricing.base_rates.studio.max}/month
- 1BR: $${businessRules.pricing.base_rates.one_bedroom.min}-$${businessRules.pricing.base_rates.one_bedroom.max}/month
- 2BR: $${businessRules.pricing.base_rates.two_bedroom.min}-$${businessRules.pricing.base_rates.two_bedroom.max}/month
- 3BR: $${businessRules.pricing.base_rates.three_bedroom.min}-$${businessRules.pricing.base_rates.three_bedroom.max}/month

PETS: Allowed (max 2, 50 lbs each, breed restrictions)
- $${businessRules.fees.pet_fees.pet_deposit} deposit + $${businessRules.fees.pet_fees.monthly_pet_rent}/month per pet

PARKING: $${businessRules.fees.parking.monthly_rate}/month (not included)

UTILITIES: Included (capped at $${businessRules.fees.utilities.cap_per_month}/month)

Your job:
1. Identify intent (booking, reservation, corporate, maintenance, question)
2. Collect necessary information professionally
3. Apply business rules and validate
4. Escalate emergencies immediately
5. Be helpful but firm on policies

Response format:
INTENT: [intent_name]
MESSAGE: [your response to user]
ACTION: [transfer|escalate|collect_info|quote|complete]
NEXT_STEP: [what info needed next, if any]`;
}

/**
 * Parse AI response
 */
function parseAIResponse(response: any): { intent: string; message: string } {
  // Extract intent and message from AI response
  const content = response.response || '';

  const intentMatch = content.match(/INTENT:\s*(\w+)/);
  const messageMatch = content.match(/MESSAGE:\s*(.+?)(?=\n|$)/);

  return {
    intent: intentMatch ? intentMatch[1] : 'unknown',
    message: messageMatch ? messageMatch[1] : content,
  };
}

/**
 * Check if message indicates emergency
 */
function isEmergency(message: string): boolean {
  const emergencyKeywords = [
    'no heat',
    'no ac',
    'no air',
    'freezing',
    'boiling',
    'water leak',
    'leak',
    'flooding',
    'flood',
    'gas smell',
    'smell gas',
    'electrical',
    'sparks',
    'fire',
    'locked out',
    'lockout',
    'emergency',
  ];

  const lowerMessage = message.toLowerCase();
  return emergencyKeywords.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Handle booking inquiry with validation
 */
function handleBookingInquiry(context: ConversationContext): OrchestratorResponse {
  if (!context.slots?.checkIn || !context.slots?.checkOut) {
    return {
      message: "I'd be happy to help you find a furnished condo. What are your check-in and check-out dates?",
      intent: 'booking_inquiry',
      action: 'collect_info',
      nextStep: 'dates',
    };
  }

  // Parse dates and validate
  const checkIn = new Date(context.slots.checkIn);
  const checkOut = new Date(context.slots.checkOut);

  const bookingRequest: BookingRequest = {
    checkIn,
    checkOut,
    unitType: (context.slots.unitType as any) || 'one_bedroom',
    guestCount: context.slots.guestCount || 1,
    petCount: context.slots.petCount,
    corporateBooking: context.slots.corporateBooking,
  };

  const validation = validateBooking(bookingRequest);
  const pricing = validation.valid || validation.allowedWithApproval
    ? calculatePricing(bookingRequest)
    : null;

  // Build response message
  let message = '';

  if (!validation.valid && validation.errors.length > 0) {
    message = "I found some issues with those dates:\n\n";
    message += validation.errors.join('\n\n');
    if (validation.suggestions && validation.suggestions.length > 0) {
      message += '\n\n' + validation.suggestions.join('\n\n');
    }
    return {
      message,
      intent: 'booking_inquiry',
      action: 'collect_info',
      nextStep: 'adjust_dates',
      validationResult: validation,
    };
  }

  if (validation.allowedWithApproval) {
    message = "I can help with that! ";
    message += validation.warnings.join(' ');
    message += '\n\nLet me collect your contact information and have our team reach out within 4 hours with availability and exact pricing for your dates.';
    return {
      message,
      intent: 'booking_inquiry',
      action: 'collect_info',
      nextStep: 'contact_info',
      validationResult: validation,
    };
  }

  // Valid booking - provide estimate
  message = "Great! Those dates work well with our rental cycle. ";
  if (validation.warnings.length > 0) {
    message += validation.warnings.join(' ') + ' ';
  }

  message += `\n\nBased on your dates, here's an estimate:\n${pricing?.breakdown.join('\n')}`;
  message += '\n\nTo get exact availability and pricing for your preferred neighborhood and unit type, can I get your name, phone, and email?';

  return {
    message,
    intent: 'booking_inquiry',
    action: 'quote',
    nextStep: 'contact_info',
    validationResult: validation,
    pricingEstimate: pricing,
  };
}

/**
 * Handle maintenance request
 */
function handleMaintenanceRequest(message: string): OrchestratorResponse {
  if (isEmergency(message)) {
    return {
      message: "That's an emergency. Let me connect you to our on-call team right now.",
      intent: 'maintenance_emergency',
      action: 'transfer',
      transferNumber: businessRules.company.phone, // Replace with actual on-call
    };
  }

  return {
    message: "I can create a maintenance request for you. Can you tell me your unit number or building address, and describe the issue?",
    intent: 'maintenance_non_emergency',
    action: 'collect_info',
    nextStep: 'maintenance_details',
  };
}

/**
 * Look up answer from knowledge base
 */
async function lookupKnowledgeBase(query: string, env: Env): Promise<string> {
  // Try to find cached answer in KV first
  const cacheKey = `kb:${query.toLowerCase().trim()}`;
  const cached = await env.RECEPTION_KV.get(cacheKey);
  if (cached) return cached;

  // Load knowledge base from KV or file
  // For now, return generic response
  // TODO: Implement proper KB search with embeddings

  return "I'd be happy to help with that! Let me get you the most accurate information. Can you be more specific about what you'd like to know?";
}
