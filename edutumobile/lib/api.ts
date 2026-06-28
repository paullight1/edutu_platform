/**
 * API Service Layer
 * Centralized HTTP client with error handling, retry logic, and TypeScript support
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfig } from './config';

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  ok: boolean;
}

export interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
  params?: Record<string, string>;
}

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 3;
const API_CACHE_PREFIX = 'edutu_api_cache:';

class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseUrl = getConfig().apiBaseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private buildCacheKey(endpoint: string, params?: Record<string, string>): string {
    const query = params ? new URLSearchParams(params).toString() : '';
    return `${API_CACHE_PREFIX}${endpoint}${query ? `?${query}` : ''}`;
  }

  private async readCachedResponse<T>(endpoint: string, params?: Record<string, string>): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(this.buildCacheKey(endpoint, params));
      return cached ? (JSON.parse(cached) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheResponse<T>(endpoint: string, data: T, params?: Record<string, string>): Promise<void> {
    try {
      await AsyncStorage.setItem(this.buildCacheKey(endpoint, params), JSON.stringify(data));
    } catch {
      // Ignore cache write failures.
    }
  }

  /**
   * Set authorization header
   */
  setAuthToken(token: string): void {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authorization header
   */
  clearAuthToken(): void {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Set user ID header for backend identification
   */
  setUserId(userId: string): void {
    this.defaultHeaders['x-user-id'] = userId;
  }

  /**
   * Build complete URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, string>): string {
    const url = `${this.baseUrl}${endpoint}`;
    
    if (!params || Object.keys(params).length === 0) {
      return url;
    }

    const searchParams = new URLSearchParams(params);
    return `${url}?${searchParams.toString()}`;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse error response
   */
  private parseError(response: Response): ApiError {
    return {
      message: 'An unexpected error occurred',
      status: response.status,
    };
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(
    endpoint: string,
    {
      method = 'GET',
      headers = {},
      body,
      timeout = DEFAULT_TIMEOUT,
      retries = DEFAULT_RETRIES,
      params,
    }: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const url = this.buildUrl(endpoint, params);
    const mergedHeaders = { ...this.defaultHeaders, ...headers };

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: mergedHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return {
            ok: false,
            error: {
              message: errorData.message || this.parseError(response).message,
              code: errorData.code,
              status: response.status,
              details: errorData.details,
            },
          };
        }

        const data = await response.json().catch(() => ({} as T));
        if (method === 'GET') {
          await this.cacheResponse(endpoint, data, params);
        }
        return { ok: true, data };

      } catch (error) {
        const isLastAttempt = attempt === retries;
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            lastError = { message: 'Request timeout', code: 'TIMEOUT' };
          } else {
            lastError = {
              message: method === 'GET'
                ? 'Network unavailable. Trying cached data.'
                : error.message,
              code: 'OFFLINE',
            };
          }
        }

        if (!isLastAttempt) {
          const delay = Math.pow(2, attempt) * 500;
          await this.sleep(delay);
        }
      }
    }

    if (method === 'GET') {
      const cachedData = await this.readCachedResponse<T>(endpoint, params);
      if (cachedData) {
        return {
          ok: true,
          data: cachedData,
          error: {
            message: 'Loaded cached data while offline',
            code: 'OFFLINE_CACHE',
          },
        };
      }
    }

    return {
      ok: false,
      error: lastError || { message: 'Max retries exceeded', code: 'MAX_RETRIES' },
    };
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', params });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
export default api;
