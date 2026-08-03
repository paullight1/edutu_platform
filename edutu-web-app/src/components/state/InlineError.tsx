import { AlertCircle } from 'lucide-react';

/**
 * Failure surfaced at the point it happened, with the recovery attached.
 *
 * The alternatives lose the user's place: a toast disappears before they can
 * act on it, and replacing the whole section with an error page throws away
 * content they were already reading.
 */
export interface InlineErrorProps {
    message: string;
    onRetry?: () => void;
    className?: string;
}

export function InlineError({ message, onRetry, className = '' }: InlineErrorProps) {
    return (
        <div
            className={`flex items-center gap-3 rounded-xl border border-danger/20 bg-danger/10 p-4 ${className}`}
            role="alert"
        >
            <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
            <p className="flex-1 text-sm text-text-primary">{message}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                >
                    Retry
                </button>
            )}
        </div>
    );
}

export default InlineError;
