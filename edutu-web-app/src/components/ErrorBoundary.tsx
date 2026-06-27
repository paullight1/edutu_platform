import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ArrowLeft, Briefcase, RefreshCw, RotateCcw } from 'lucide-react';
import { captureException } from '../lib/sentry';

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
        console.error('ErrorBoundary caught an error:', error, errorInfo);

        this.setState({ errorInfo });

        captureException(error, {
            componentStack: errorInfo.componentStack,
        });
    }

    handleGoHome = (): void => {
        window.location.href = '/opportunities';
    };

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null
        });
    };

    handleReload = (): void => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            // Custom fallback UI provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-5 py-10 text-slate-950">
                    <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                            <Briefcase className="h-8 w-8" />
                        </div>

                        <h1 className="mt-5 text-xl font-black tracking-tight text-slate-950">
                            This view is empty right now
                        </h1>
                        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
                            We could not load this page. Try again, or go back to the opportunities feed.
                        </p>

                        <div className="mt-6 flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={this.handleRetry}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-black text-white transition-colors hover:bg-brand-600"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Try again
                            </button>

                            <button
                                type="button"
                                onClick={this.handleReload}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Reload page
                            </button>

                            <button
                                type="button"
                                onClick={this.handleGoHome}
                                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                Back to opportunities
                            </button>
                        </div>
                    </section>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
