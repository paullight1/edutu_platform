import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // Log the error to console (in production, send to error tracking service)
        console.error('ErrorBoundary caught an error:', error);
        console.error('Error Info:', errorInfo);

        this.setState({ errorInfo });

        // TODO: Send to error tracking service like Sentry
        // if (typeof window !== 'undefined' && window.Sentry) {
        //   window.Sentry.captureException(error, { extra: errorInfo });
        // }
    }

    handleReload = (): void => {
        window.location.reload();
    };

    handleGoHome = (): void => {
        window.location.href = '/app/home';
    };

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    render() {
        if (this.state.hasError) {
            // Custom fallback UI provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error UI
            return (
                <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex items-center justify-center p-6">
                    <div className="max-w-md w-full">
                        {/* Error Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                                <AlertTriangle className="w-10 h-10 text-red-500" />
                            </div>
                        </div>

                        {/* Error Message */}
                        <div className="text-center mb-8">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                Oops! Something went wrong
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                We're sorry, but something unexpected happened. Don't worry, your data is safe.
                            </p>
                        </div>

                        {/* Error Details (Development only) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                                <p className="text-sm font-mono text-red-600 dark:text-red-400 break-words">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="mt-2 text-xs font-mono text-red-500 dark:text-red-500 overflow-auto max-h-32">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={this.handleRetry}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Try Again
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-xl transition-colors"
                            >
                                <Home className="w-5 h-5" />
                                Go to Home
                            </button>

                            <button
                                onClick={this.handleReload}
                                className="w-full px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>

                        {/* Support Link */}
                        <p className="text-center text-sm text-gray-500 dark:text-gray-500 mt-8">
                            If this problem persists, please{' '}
                            <a
                                href="/app/help"
                                className="text-brand-600 hover:text-brand-700 font-medium"
                            >
                                contact support
                            </a>
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
