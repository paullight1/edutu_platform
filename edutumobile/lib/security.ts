/**
 * Security Utilities
 * Input validation, sanitization, and security helpers
 */

/**
 * Validation result type
 */
export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phone validation regex (international format)
 */
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/**
 * URL validation regex
 */
const URL_REGEX = /^https?:\/\/.+/;

/**
 * Sanitize string to prevent XSS
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

/**
 * Validate email format
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  
  if (!EMAIL_REGEX.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  if (email.length > 254) {
    return { isValid: false, error: 'Email is too long' };
  }
  
  return { isValid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { isValid: false, error: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters' };
  }
  
  if (password.length > 128) {
    return { isValid: false, error: 'Password is too long' };
  }
  
  return { isValid: true };
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): ValidationResult {
  if (!phone) {
    return { isValid: true }; // Phone is optional
  }
  
  const cleanPhone = phone.replace(/[\s-()]/g, '');
  
  if (!PHONE_REGEX.test(cleanPhone)) {
    return { isValid: false, error: 'Invalid phone number format' };
  }
  
  return { isValid: true };
}

/**
 * Validate URL
 */
export function validateUrl(url: string): ValidationResult {
  if (!url) {
    return { isValid: true }; // URL is optional
  }
  
  if (!URL_REGEX.test(url)) {
    return { isValid: false, error: 'Invalid URL format' };
  }
  
  return { isValid: true };
}

/**
 * Validate required field
 */
export function validateRequired(value: string, fieldName: string): ValidationResult {
  if (!value || value.trim().length === 0) {
    return { isValid: false, error: `${fieldName} is required` };
  }
  return { isValid: true };
}

/**
 * Validate string length
 */
export function validateLength(
  value: string,
  min: number,
  max: number,
  fieldName: string
): ValidationResult {
  if (value.length < min) {
    return { isValid: false, error: `${fieldName} must be at least ${min} characters` };
  }
  
  if (value.length > max) {
    return { isValid: false, error: `${fieldName} must be at most ${max} characters` };
  }
  
  return { isValid: true };
}

/**
 * Validate selection from options
 */
export function validateSelect(
  value: string | null | undefined,
  options: readonly string[],
  fieldName: string
): ValidationResult {
  if (!value) {
    return { isValid: false, error: `Please select a ${fieldName}` };
  }
  
  if (!options.includes(value)) {
    return { isValid: false, error: `Invalid ${fieldName} selection` };
  }
  
  return { isValid: true };
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars = 4): string {
  if (!data || data.length <= visibleChars) {
    return '***';
  }
  
  const visible = data.slice(-visibleChars);
  const masked = '*'.repeat(data.length - visibleChars);
  return masked + visible;
}

/**
 * Validate form data object
 */
export function validateForm<T extends Record<string, string>>(
  data: T,
  rules: Partial<Record<keyof T, (value: string) => ValidationResult>>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  
  for (const [field, validator] of Object.entries(rules)) {
    if (!validator) continue;
    const value = data[field];
    const result = validator(value);
    
    if (!result.isValid && result.error) {
      errors[field] = result.error;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
