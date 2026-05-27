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

            const isDev = import.meta.env.DEV;

            return (
                <div className="min-h-screen bg-[#05070d] text-white flex items-center justify-center px-5 py-10">
                    <style>{`
                        @keyframes edutuPulseLine {
                            0%, 100% { stroke-dashoffset: 120; opacity: .32; }
                            45% { stroke-dashoffset: 0; opacity: 1; }
                        }

                        @keyframes edutuFloat {
                            0%, 100% { transform: translateY(0); }
                            50% { transform: translateY(-8px); }
                        }

                        @keyframes edutuSweep {
                            0% { transform: translateX(-120px); opacity: 0; }
                            35%, 70% { opacity: .75; }
                            100% { transform: translateX(120px); opacity: 0; }
                        }

                        .edutu-error-line {
                            stroke-dasharray: 120;
                            animation: edutuPulseLine 2.4s ease-in-out infinite;
                        }

                        .edutu-error-float {
                            animation: edutuFloat 3.6s ease-in-out infinite;
                            transform-origin: center;
                        }

                        .edutu-error-sweep {
                            animation: edutuSweep 3.2s ease-in-out infinite;
                            transform-origin: center;
                        }
                    `}</style>

                    <div className="w-full max-w-[560px] text-center">
                        <div className="mx-auto mb-8 flex h-44 w-44 items-center justify-center">
                            <svg
                                viewBox="0 0 220 220"
                                role="img"
                                aria-label="Recovery illustration"
                                className="h-full w-full overflow-visible"
                            >
                                <defs>
                                    <linearGradient id="edutu-error-blue" x1="34" y1="28" x2="172" y2="188" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#2f80ff" />
                                        <stop offset="1" stopColor="#20d3a2" />
                                    </linearGradient>
                                    <filter id="edutu-error-glow" x="-30%" y="-30%" width="160%" height="160%">
                                        <feGaussianBlur stdDeviation="5" result="blur" />
                                        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.05 0 0 0 0 0.45 0 0 0 0 1 0 0 0 .55 0" />
                                        <feMerge>
                                            <feMergeNode />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                </defs>

                                <circle cx="110" cy="110" r="82" fill="#071426" stroke="#18385d" strokeWidth="1" />
                                <circle cx="110" cy="110" r="56" fill="#0b1c31" stroke="url(#edutu-error-blue)" strokeWidth="2" filter="url(#edutu-error-glow)" />
                                <g className="edutu-error-float">
                                    <path d="M72 126h76c8 0 14-6 14-14V80c0-8-6-14-14-14H72c-8 0-14 6-14 14v32c0 8 6 14 14 14Z" fill="#102a45" stroke="#2f80ff" strokeWidth="2" />
                                    <path d="M82 96h22m12 0h22M82 110h44" stroke="#9ec8ff" strokeWidth="5" strokeLinecap="round" />
                                    <path d="M111 147l17-27H94l17 27Z" fill="#20d3a2" opacity=".9" />
                                </g>
                                <path className="edutu-error-line" d="M40 161c24-18 44-18 68 0s48 18 72 0" fill="none" stroke="url(#edutu-error-blue)" strokeWidth="4" strokeLinecap="round" />
                                <rect className="edutu-error-sweep" x="70" y="53" width="80" height="5" rx="2.5" fill="#ffffff" opacity=".35" />
                            </svg>
                        </div>

                        <div className="mb-7">
                            <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[#20d3a2]">
                                Admin recovery
                            </p>
                            <h1 className="mb-3 text-3xl font-black text-white sm:text-4xl">
                                This screen needs a quick refresh
                            </h1>
                            <p className="mx-auto max-w-[420px] text-base leading-7 text-slate-300">
                                The admin console hit a snag, but your data is still safe. Try again, reload the page, or return home.
                            </p>
                        </div>

                        <div className="mx-auto flex max-w-[420px] flex-col gap-3">
                            <button
                                onClick={this.handleRetry}
                                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1677ff] px-6 py-3.5 font-bold text-white shadow-[0_18px_44px_rgba(22,119,255,0.28)] transition-colors hover:bg-[#0f66df]"
                            >
                                <RefreshCw className="w-5 h-5" />
                                Try Again
                            </button>

                            <button
                                onClick={this.handleGoHome}
                                className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-6 py-3.5 font-bold text-white transition-colors hover:bg-white/[0.1]"
                            >
                                <Home className="w-5 h-5" />
                                Go to Home
                            </button>

                            <button
                                onClick={this.handleReload}
                                className="w-full px-6 py-3 text-sm font-semibold text-slate-400 transition-colors hover:text-white"
                            >
                                Reload Page
                            </button>
                        </div>

                        {isDev && this.state.error && (
                            <details className="mx-auto mt-6 max-w-[520px] rounded-lg border border-[#2f80ff]/25 bg-[#071426] text-left">
                                <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-200">
                                    Developer details
                                </summary>
                                <div className="border-t border-white/10 p-4">
                                    <p className="break-words font-mono text-xs leading-5 text-[#ff7ab2]">
                                        {this.state.error.toString()}
                                    </p>
                                    {this.state.errorInfo && (
                                        <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-slate-400">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            </details>
                        )}

                        <p className="mt-8 text-center text-sm text-slate-500">
                            If this keeps happening,{' '}
                            <a
                                href="/app/help"
                                className="font-bold text-[#69a8ff] hover:text-white"
                            >
                                contact support
                            </a>
                            .
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
