import { Request } from 'express';

export interface BootstrapSystemResponseDTO {
  commandId: string;
  message: string;
}

export interface InitializeCountryDataRequestDTO {
  countriesData: Array<{ code: string; name: string }>;
}

export interface UpdateSystemParameterRequestDTO {
  paramId: string;
  newValue: string;
}

export interface PauseSystemRequestDTO {
  reason: string;
}

export interface AppointAdminRequestDTO {
  newAdminId: string;
}

export interface ActivateTreasuryRequestDTO {
  countryCode: string;
}

export interface SystemStatusDTO {
  isPaused: boolean;
  pauseReason?: string;
  lastUpdated: Date;
}

export interface SystemParameterDTO {
  paramId: string;
  value: string;
  lastUpdated: Date;
}

export interface CountryStatsDTO {
  countryCode: string;
  totalSupply: number;
  userCount: number;
}

export interface GlobalCountersDTO {
  totalSupply: number;
  totalUsers: number;
  totalOrganizations: number;
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
