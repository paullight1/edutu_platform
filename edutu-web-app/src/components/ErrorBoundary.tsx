import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, Home } from 'lucide-react';

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

            const isDev = import.meta.env.DEV;

            return (
                <div className="flex min-h-screen items-center justify-center bg-[#f7fbff] px-5 py-10 text-[#102033]">
                    <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
                        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf3ff] text-[#146ef5]">
                            <RefreshCw className="h-5 w-5" />
                        </div>

                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#146ef5]">
                            Quick refresh
                        </p>
                        <h1 className="mb-3 text-2xl font-black text-[#0b1728] sm:text-3xl">
                            Something went wrong
                        </h1>
                        <p className="mx-auto max-w-[340px] text-sm leading-6 text-slate-600">
                            We hit a temporary issue. Your data is safe, and you can retry or go back home.
                        </p>

                        <div className="mt-7 grid gap-3 sm:grid-cols-2">
                            <button
                                onClick={this.handleRetry}
                                className="flex items-center justify-center gap-2 rounded-lg bg-[#146ef5] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[#0055d4]"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Try again
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-[#102033] transition-colors hover:bg-slate-50"
                            >
                                <Home className="h-4 w-4" />
                                Home
                            </button>
                        </div>

                        {isDev && this.state.error && (
                            <details className="mt-5 rounded-lg border border-slate-200 bg-slate-50 text-left">
                                <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                                    Developer details
                                </summary>
                                <div className="border-t border-slate-200 p-4">
                                    <p className="break-words font-mono text-xs leading-5 text-rose-600">
                                        {this.state.error.toString()}
                                    </p>
                                    {this.state.errorInfo && (
                                        <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-500">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
