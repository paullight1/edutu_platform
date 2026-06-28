/**
 * Library Index
 * Re-exports all utilities and services from lib/
 */

// Core exports
export { config, getConfig, validateEnvironment } from './config';
export type { AppConfig } from './config';

export { api } from './api';
export type { ApiError, ApiResponse, RequestConfig } from './api';

export { 
  validateEmail, 
  validatePassword, 
  validatePhone, 
  validateUrl, 
  validateRequired, 
  validateLength,
  validateSelect,
  validateForm,
  sanitizeString,
  maskSensitiveData 
} from './security';
export type { ValidationResult } from './security';

export { 
  cn,
  formatDate,
  formatRelativeTime,
  formatCompactNumber,
  formatCredits,
  truncate,
  generateId,
  debounce,
  throttle,
  capitalize,
  getInitials,
  sleep,
  isEmpty,
  groupBy,
  sortBy
} from './utils';

// Re-export supabase client
export { supabase } from './supabase';
