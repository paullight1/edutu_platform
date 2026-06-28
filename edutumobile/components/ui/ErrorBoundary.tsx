import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react-native';
import { useRouter } from 'expo-router';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    message?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo.componentStack);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <ErrorFallback
                    error={this.state.error}
                    message={this.props.message || 'Something went wrong'}
                />
            );
        }

        return this.props.children;
    }
}

function ErrorFallback({ error, message }: { error: Error | null; message: string }) {
    const router = useRouter();

    return (
        <View style={styles.container}>
            <View style={styles.iconContainer}>
                <AlertTriangle size={48} color="#EF4444" />
            </View>
            <Text style={styles.title}>{message}</Text>
            <Text style={styles.subtitle} numberOfLines={3}>
                {error?.message || 'An unexpected error occurred'}
            </Text>
            <View style={styles.buttonRow}>
                <TouchableOpacity
                    style={[styles.button, styles.secondaryButton]}
                    onPress={() => router.replace('/(app)')}
                >
                    <Home size={18} color="#6366F1" />
                    <Text style={[styles.buttonText, { color: '#6366F1' }]}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => {
                        // Trigger a refresh by navigating away and back
                        router.replace('/(app)');
                        setTimeout(() => router.replace('/(app)'), 100);
                    }}
                >
                    <RefreshCcw size={18} color="white" />
                    <Text style={[styles.buttonText, { color: 'white' }]}>Try Again</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

// Hook-style wrapper for functional components
export function useErrorBoundary() {
    // This is a no-op hook - the actual error boundary is a class component
    return { hasError: false, error: null };
}

export function withErrorBoundary<P extends object>(
    Component: React.ComponentType<P>,
    props?: Omit<Props, 'children'>
) {
    return function WrappedComponent(componentProps: P) {
        return (
            <ErrorBoundaryClass {...props}>
                <Component {...componentProps} />
            </ErrorBoundaryClass>
        );
    };
}

export { ErrorBoundaryClass as ErrorBoundary };

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        backgroundColor: '#020617',
    },
    iconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#f8fafc',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 22,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    primaryButton: {
        backgroundColor: '#6366F1',
    },
    secondaryButton: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    buttonText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
