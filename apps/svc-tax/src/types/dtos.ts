import { Request } from 'express';

export interface CalculateFeeRequestDTO {
  amount: number;
}

export interface CalculateFeeResponseDTO {
  fee: number;
}

export interface ApplyVelocityTaxRequestDTO {
  accountId: string;
  taxRateBps: number;
}

export interface ApplyVelocityTaxResponseDTO {
  commandId: string;
  message: string;
}

export interface CheckEligibilityResponseDTO {
  eligible: boolean;
  reason: string;
  details?: {
    accountType?: string;
    timerStartDate?: string;
    daysSinceTimerStart?: number;
    requiredDays?: number;
    daysRemaining?: number;
    currentBalance?: number;
    minimumBalance?: number;
    balanceInCoins?: number;
    minimumInCoins?: number;
    velocityTaxPeriod?: number;
  };
}

export interface JWTPayload {
  profileId: string;
  email: string | null;
  status: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}
