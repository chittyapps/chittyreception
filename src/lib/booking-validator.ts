// Booking validation logic enforcing business rules

import businessRules from '../../config/business-rules.json';

export interface BookingRequest {
  checkIn: Date;
  checkOut: Date;
  unitType: 'studio' | 'one_bedroom' | 'two_bedroom' | 'three_bedroom';
  guestCount: number;
  petCount?: number;
  corporateBooking?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions?: string[];
  allowedWithApproval?: boolean;
}

/**
 * Validate booking request against business rules
 */
export function validateBooking(request: BookingRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  let allowedWithApproval = false;

  // Calculate stay duration
  const stayDays = Math.ceil(
    (request.checkOut.getTime() - request.checkIn.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Rule 1: Minimum stay 32+ days
  const minStay = businessRules.booking_policies.minimum_stay.days;
  if (stayDays < minStay) {
    const vacancyException = businessRules.booking_policies.minimum_stay.exceptions.vacancy_pressure;

    if (stayDays >= vacancyException.min_days && vacancyException.enabled) {
      warnings.push(
        `Stay of ${stayDays} days is below our standard ${minStay}-day minimum. ` +
        `This may be possible if we have vacancy pressure - requires approval.`
      );
      allowedWithApproval = true;
    } else {
      errors.push(
        `Minimum stay is ${minStay} days for Chicago compliance. ` +
        `Your requested stay is ${stayDays} days.`
      );
      suggestions.push(
        `Consider extending to ${minStay}+ days, or we can check if shorter stays are available due to vacancy.`
      );
    }
  }

  // Rule 2: Month boundary alignment (first to last of month)
  const checkInDay = request.checkIn.getDate();
  const checkOutDay = request.checkOut.getDate();
  const checkOutMonth = request.checkOut.getMonth();
  const checkOutYear = request.checkOut.getFullYear();
  const lastDayOfMonth = new Date(checkOutYear, checkOutMonth + 1, 0).getDate();

  const startsOnFirst = checkInDay === 1;
  const endsOnLast = checkOutDay === lastDayOfMonth;

  if (!startsOnFirst || !endsOnLast) {
    warnings.push(
      'Our standard rental cycle runs first of the month to last of the month. ' +
      'Mid-month dates may be possible if we have availability.'
    );

    // Suggest nearest month boundaries
    const suggestedCheckIn = new Date(request.checkIn);
    suggestedCheckIn.setDate(1);

    const suggestedCheckOut = new Date(request.checkOut);
    suggestedCheckOut.setMonth(suggestedCheckOut.getMonth() + 1);
    suggestedCheckOut.setDate(0); // Last day of previous month (= desired month)

    suggestions.push(
      `Consider ${suggestedCheckIn.toLocaleDateString()} to ${suggestedCheckOut.toLocaleDateString()} ` +
      `to align with our standard monthly cycle.`
    );
  }

  // Rule 3: Advance notice
  const daysUntilCheckIn = Math.ceil(
    (request.checkIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const minNotice = businessRules.booking_policies.advance_booking.minimum_notice_days;
  if (daysUntilCheckIn < minNotice) {
    errors.push(
      `Bookings require ${minNotice} days advance notice. ` +
      `Your check-in is in ${daysUntilCheckIn} days.`
    );
  }

  const maxAdvance = businessRules.booking_policies.advance_booking.maximum_advance_months * 30;
  if (daysUntilCheckIn > maxAdvance) {
    warnings.push(
      `Check-in is more than ${businessRules.booking_policies.advance_booking.maximum_advance_months} months away. ` +
      `We recommend booking 30-90 days in advance for best availability.`
    );
  }

  // Rule 4: Pet validation
  if (request.petCount && request.petCount > 0) {
    const petPolicy = businessRules.policies.pets;

    if (!petPolicy.allowed) {
      errors.push('Pets are not allowed in our properties.');
    } else if (request.petCount > petPolicy.restrictions.max_count) {
      errors.push(
        `Maximum ${petPolicy.restrictions.max_count} pets allowed. ` +
        `You requested ${request.petCount}.`
      );
    } else {
      warnings.push(
        `Pet fees apply: $${businessRules.fees.pet_fees.pet_deposit} deposit + ` +
        `$${businessRules.fees.pet_fees.monthly_pet_rent}/month per pet. ` +
        `Weight limit: ${petPolicy.restrictions.max_weight} lbs. ` +
        `Breed restrictions apply.`
      );
    }
  }

  // Rule 5: Corporate booking minimums
  if (request.corporateBooking) {
    const corpPolicy = businessRules.corporate_policies;
    const stayMonths = stayDays / 30;

    if (stayMonths < corpPolicy.minimum_commitment_months) {
      warnings.push(
        `Corporate bookings typically require ${corpPolicy.minimum_commitment_months}+ months. ` +
        `Contact us for custom arrangements.`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    allowedWithApproval: allowedWithApproval && errors.length === 0,
  };
}

/**
 * Calculate estimated pricing for a booking
 */
export function calculatePricing(request: BookingRequest): {
  monthlyRate: { min: number; max: number; avg: number };
  estimatedTotal: number;
  fees: Record<string, number>;
  deposits: Record<string, number>;
  breakdown: string[];
} {
  const rates = businessRules.pricing.base_rates[request.unitType];
  const stayDays = Math.ceil(
    (request.checkOut.getTime() - request.checkIn.getTime()) / (1000 * 60 * 60 * 24)
  );
  const stayMonths = stayDays / 30;

  // Base monthly rate (use average)
  let monthlyRate = rates.avg;

  // Apply length-of-stay discount
  const discounts = businessRules.pricing.discounts.length_of_stay;
  let discountPercent = 0;
  if (stayMonths >= 12) discountPercent = discounts['12_months'];
  else if (stayMonths >= 6) discountPercent = discounts['6_months'];
  else if (stayMonths >= 3) discountPercent = discounts['3_months'];

  if (discountPercent > 0) {
    monthlyRate = monthlyRate * (1 - discountPercent / 100);
  }

  // Calculate total rent
  const totalRent = monthlyRate * stayMonths;

  // Fees
  const fees: Record<string, number> = {};

  // Cleaning fee
  fees.cleaning = businessRules.fees.cleaning[request.unitType];
  if (stayMonths >= businessRules.fees.cleaning.waived_if_stay_over_months) {
    fees.cleaning = 0; // Waived for long stays
  }

  // Pet fees
  if (request.petCount && request.petCount > 0) {
    fees.pet_deposit = businessRules.fees.pet_fees.pet_deposit;
    fees.pet_monthly = businessRules.fees.pet_fees.monthly_pet_rent * request.petCount * stayMonths;
  }

  // Deposits
  const deposits: Record<string, number> = {
    security: monthlyRate, // One month rent
  };

  // Calculate total
  const totalFees = Object.values(fees).reduce((sum, fee) => sum + fee, 0);
  const totalDeposits = Object.values(deposits).reduce((sum, dep) => sum + dep, 0);
  const estimatedTotal = totalRent + totalFees + totalDeposits;

  // Breakdown
  const breakdown = [
    `Monthly Rate: $${monthlyRate.toFixed(2)}${discountPercent > 0 ? ` (${discountPercent}% discount)` : ''}`,
    `Duration: ${stayMonths.toFixed(1)} months (${stayDays} days)`,
    `Total Rent: $${totalRent.toFixed(2)}`,
  ];

  if (fees.cleaning > 0) breakdown.push(`Cleaning Fee: $${fees.cleaning}`);
  if (fees.pet_deposit) breakdown.push(`Pet Deposit: $${fees.pet_deposit} (refundable)`);
  if (fees.pet_monthly) breakdown.push(`Pet Monthly: $${fees.pet_monthly}`);
  breakdown.push(`Security Deposit: $${deposits.security.toFixed(2)} (refundable)`);
  breakdown.push(`---`);
  breakdown.push(`Estimated Total: $${estimatedTotal.toFixed(2)}`);

  return {
    monthlyRate: rates,
    estimatedTotal,
    fees,
    deposits,
    breakdown,
  };
}

/**
 * Get available unit types for date range
 * This would typically query your availability API
 */
export async function checkAvailability(
  checkIn: Date,
  checkOut: Date,
  unitType?: string
): Promise<{
  available: boolean;
  units: Array<{
    id: string;
    type: string;
    building: string;
    floor: number;
    monthlyRate: number;
    amenities: string[];
  }>;
}> {
  // TODO: Integrate with actual availability API/database
  // For now, return mock data
  return {
    available: true,
    units: [],
  };
}
