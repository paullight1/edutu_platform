/**
 * Edutu Scraper Engine - Error Tracking Module
 * Production-ready error handling and monitoring
 */

// Simple in-memory error log (in production, use Sentry or similar)
class ErrorTracker {
    constructor() {
        this.errors = [];
        this.maxErrors = 100;
    }

    /**
     * Log an error with context
     * @param {string} type - Error type (scrape, database, api, etc.)
     * @param {string} message - Error message
     * @param {Object} context - Additional context
     */
    log(type, message, context = {}) {
        const error = {
            id: crypto.randomUUID(),
            type,
            message,
            context,
            timestamp: new Date().toISOString(),
            stack: new Error().stack
        };

        this.errors.unshift(error);
        
        // Keep only last maxErrors
        if (this.errors.length > this.maxErrors) {
            this.errors = this.errors.slice(0, this.maxErrors);
        }

        // Console output in development
        if (process.env.NODE_ENV !== 'production') {
            console.error(`[ErrorTracker:${type}]`, message, context);
        }

        return error;
    }

    /**
     * Get recent errors
     * @param {number} limit - Number of errors to return
     * @param {string} type - Filter by type
     */
    getRecent(limit = 50, type = null) {
        let errors = this.errors;
        
        if (type) {
            errors = errors.filter(e => e.type === type);
        }
        
        return errors.slice(0, limit);
    }

    /**
     * Get error statistics
     */
    getStats() {
        const stats = {
            total: this.errors.length,
            byType: {},
            recent: this.errors.slice(0, 10).map(e => ({
                type: e.type,
                message: e.message,
                timestamp: e.timestamp
            }))
        };

        for (const error of this.errors) {
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
        }

        return stats;
    }

    /**
     * Clear all errors
     */
    clear() {
        this.errors = [];
    }
}

const errorTracker = new ErrorTracker();

/**
 * Middleware for API error handling
 */
export function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || 'Internal server error';
    const code = err.code || 'INTERNAL_ERROR';

    // Log the error
    errorTracker.log('api', message, {
        statusCode,
        code,
        method: req.method,
        path: req.path,
        query: req.query,
        userId: req.user?.id
    });

    // Don't expose internal errors in production
    const responseMessage = process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Internal server error'
        : message;

    res.status(statusCode).json({
        success: false,
        error: responseMessage,
        code,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Log scraper errors specifically
 */
export function logScrapeError(message, context = {}) {
    return errorTracker.log('scrape', message, context);
}

/**
 * Log database errors
 */
export function logDatabaseError(message, context = {}) {
    return errorTracker.log('database', message, context);
}

/**
 * Log authentication errors
 */
export function logAuthError(message, context = {}) {
    return errorTracker.log('auth', message, context);
}

/**
 * Get all tracked errors
 */
export function getErrors(limit, type) {
    return errorTracker.getRecent(limit, type);
}

/**
 * Get error statistics
 */
export function getErrorStats() {
    return errorTracker.getStats();
}

/**
 * Clear error logs
 */
export function clearErrors() {
    errorTracker.clear();
}

export default {
    errorHandler,
    asyncHandler,
    logScrapeError,
    logDatabaseError,
    logAuthError,
    getErrors,
    getErrorStats,
    clearErrors,
    errorTracker
};
