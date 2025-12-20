import fetch, { Response } from 'node-fetch';
import { getApiUrl, getAccessToken, getRefreshToken, setCredentials, clearCredentials } from './config';

// ============================================================================
// Types
// ============================================================================

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
  };
}

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================================================
// API Client
// ============================================================================

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getApiUrl();
  }

  // ==========================================================================
  // Core Request Method
  // ==========================================================================

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    authenticated = true
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authenticated) {
      const token = getAccessToken();
      if (!token) {
        return {
          success: false,
          error: { message: 'Not logged in. Run: gx admin login' },
        };
      }
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle token refresh on 401
      if (response.status === 401 && authenticated) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry with new token
          headers['Authorization'] = `Bearer ${getAccessToken()}`;
          const retryResponse = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          return this.parseResponse<T>(retryResponse);
        }
        // Refresh failed, clear credentials
        clearCredentials();
        return {
          success: false,
          error: { code: 'SESSION_EXPIRED', message: 'Session expired. Please login again.' },
        };
      }

      return this.parseResponse<T>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return {
        success: false,
        error: { message: `Request failed: ${message}` },
      };
    }
  }

  private async parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const data = await response.json() as T;

    if (!response.ok) {
      const errorData = data as unknown as { error?: string; code?: string; message?: string };
      return {
        success: false,
        error: {
          code: errorData.code,
          message: errorData.message || errorData.error || 'Request failed',
        },
      };
    }

    return { success: true, data };
  }

  // ==========================================================================
  // Token Refresh
  // ==========================================================================

  private async refreshToken(): Promise<boolean> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/admin/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as RefreshTokenResponse;
      setCredentials({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: Date.now() + data.expiresIn * 1000,
      });

      return true;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // Public HTTP Methods
  // ==========================================================================

  async get<T>(endpoint: string, authenticated = true): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, authenticated);
  }

  async post<T>(endpoint: string, body?: unknown, authenticated = true): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body, authenticated);
  }

  async delete<T>(endpoint: string, authenticated = true): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, authenticated);
  }
}

// Export singleton
export const api = new ApiClient();
