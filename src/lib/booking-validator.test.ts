import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateBooking, calculatePricing, type BookingRequest } from './booking-validator';

// Helper to make local dates at noon to avoid DST/midnight edge cases
function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}

describe('booking-validator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze time to a stable point to make advance notice deterministic
    vi.setSystemTime(localDate(2025, 0, 1)); // 2025-01-01
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates a compliant 32+ day booking aligned to month boundaries', () => {
    const request: BookingRequest = {
      checkIn: localDate(2025, 1, 1), // Feb 1, 2025
      checkOut: localDate(2025, 2, 31), // Mar 31, 2025 (last day of month)
      unitType: 'one_bedroom',
      guestCount: 2,
    };

    const result = validateBooking(request);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // Month-aligned, adequate notice, so no warnings expected here
    expect(result.warnings.length).toBe(0);
    expect(result.allowedWithApproval).toBe(false);
  });

  it('allows 30-day stays with approval under vacancy exception', () => {
    const request: BookingRequest = {
      checkIn: localDate(2025, 1, 1), // Feb 1, 2025
      checkOut: localDate(2025, 2, 3), // Mar 3, 2025 (~30 days)
      unitType: 'studio',
      guestCount: 1,
    };

    const result = validateBooking(request);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // Should warn about minimum stay exception and possibly month alignment
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some(w => w.includes('below our standard'))).toBe(true);
    expect(result.allowedWithApproval).toBe(true);
  });

  it('rejects pet count above allowed maximum', () => {
    const request: BookingRequest = {
      checkIn: localDate(2025, 1, 1),
      checkOut: localDate(2025, 2, 28), // Mar 28 ensures 32+ days
      unitType: 'two_bedroom',
      guestCount: 2,
      petCount: 3, // Over the max of 2
    };

    const result = validateBooking(request);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.startsWith('Maximum'))).toBe(true);
    expect(result.allowedWithApproval).toBe(false);
  });

  it('enforces advance notice requirement', () => {
    const request: BookingRequest = {
      // With now frozen at 2025-01-01, pick check-in too soon
      checkIn: localDate(2025, 0, 3), // Jan 3, 2025 (2 days notice)
      checkOut: localDate(2025, 1, 5), // Feb 5, 2025 (>= 32 days stay)
      unitType: 'studio',
      guestCount: 1,
    };

    const result = validateBooking(request);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('advance notice'))).toBe(true);
  });

  it('calculates pricing with length-of-stay discount and waived cleaning for 6 months', () => {
    const request: BookingRequest = {
      checkIn: localDate(2025, 0, 1),
      checkOut: localDate(2025, 6, 1), // ~6 months later (Jan 1 -> Jul 1)
      unitType: 'one_bedroom', // avg 3200
      guestCount: 2,
    };

    const pricing = calculatePricing(request);

    // Expect 10% discount for 6+ months: 3200 -> 2880
    expect(pricing.breakdown.some(line => line.includes('Monthly Rate: $2880.00') && line.includes('10% discount'))).toBe(true);
    // Total rent should be monthly * months (approx 6 months by 30-day basis)
    expect(pricing.breakdown.some(line => line.includes('Total Rent: $'))).toBe(true);
    expect(pricing.fees.cleaning).toBe(0); // waived at >= 6 months
    // Security deposit equals one month rent (discounted monthly)
    expect(pricing.breakdown.some(line => line.includes('Security Deposit: $2880.00'))).toBe(true);
    // Estimated total equals totalRent + deposits + fees
    expect(pricing.breakdown.some(line => line.startsWith('Estimated Total: $'))).toBe(true);
  });
});

