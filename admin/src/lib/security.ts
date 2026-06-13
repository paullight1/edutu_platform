/**
 * Security Utilities for Admin Portal
 * 
 * Provides XSS sanitization, input validation, and security helpers
 */

/**
 * Sanitize user input to prevent XSS attacks
 * Removes HTML tags and encodes special characters
 */
export function sanitizeInput(input: string | null | undefined): string {
    if (!input) return '';
    
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize HTML content while preserving safe tags
 * Use for rich text content that needs to display HTML
 */
export function sanitizeHtml(input: string | null | undefined): string {
    if (!input) return '';
    
    // Remove script tags and event handlers
    return input
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
        .replace(/<object[^>]*>.*?<\/object>/gi, '')
        .replace(/<embed[^>]*>.*?<\/embed>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Validate that URL uses HTTPS
 */
export function isValidHttpsUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Sanitize file name to prevent path traversal
 */
export function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/_{2,}/g, '_')
        .substring(0, 255);
}

/**
 * Generate a secure random ID
 */
export function generateSecureId(): string {
    return crypto.randomUUID();
}

/**
 * Rate limiter for API calls
 * Usage: const limiter = new RateLimiter(5, 60000); // 5 calls per minute
 */
export class RateLimiter {
    private calls: number[] = [];
    
    constructor(
        private maxCalls: number,
        private windowMs: number
    ) {}
    
    canCall(): boolean {
        const now = Date.now();
        // Remove old calls outside the window
        this.calls = this.calls.filter(time => now - time < this.windowMs);
        
        if (this.calls.length < this.maxCalls) {
            this.calls.push(now);
            return true;
        }
        
        return false;
    }
    
    getTimeUntilNextCall(): number {
        if (this.calls.length === 0) return 0;
        const oldestCall = this.calls[0];
        const timeUntil = this.windowMs - (Date.now() - oldestCall);
        return Math.max(0, timeUntil);
    }
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: unknown[]) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout>;
    
    return (...args: Parameters<T>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Check if string contains potential SQL injection patterns
 */
export function containsSqlInjection(input: string): boolean {
    const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
        /(--|;|\/\*|\*\/)/,
        /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
        /'\s*OR\s*'/i,
        /;\s*$/,
    ];
    
    return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];
    
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Mask sensitive data (email, phone, etc.)
 */
export function maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;
    
    const maskedLocal = localPart.length > 2 
        ? localPart.substring(0, 2) + '*'.repeat(localPart.length - 2)
        : '*'.repeat(localPart.length);
    
    return `${maskedLocal}@${domain}`;
}
