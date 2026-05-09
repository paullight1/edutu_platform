import React, { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Accessibility Utilities and Hooks
 * 
 * This module provides utilities for improving application accessibility.
 */

/**
 * useFocusTrap Hook
 * 
 * Traps focus within a container element (useful for modals, dialogs)
 */
export function useFocusTrap(isActive: boolean = true) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isActive || !containerRef.current) return;

        const container = containerRef.current;
        const focusableElements = container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        const handleTabKey = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            if (e.shiftKey) {
                if (document.activeElement === firstElement) {
                    lastElement?.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastElement) {
                    firstElement?.focus();
                    e.preventDefault();
                }
            }
        };

        // Focus first element when trap is activated
        firstElement?.focus();

        document.addEventListener('keydown', handleTabKey);
        return () => document.removeEventListener('keydown', handleTabKey);
    }, [isActive]);

    return containerRef;
}

/**
 * useAnnounce Hook
 * 
 * Announces messages to screen readers via ARIA live region
 */
export function useAnnounce() {
    const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const announcer = document.createElement('div');
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        announcer.textContent = message;

        document.body.appendChild(announcer);

        // Remove after announcement
        setTimeout(() => {
            document.body.removeChild(announcer);
        }, 1000);
    }, []);

    return announce;
}

/**
 * useReducedMotion Hook
 * 
 * Detects user's reduced motion preference
 */
export function useReducedMotion(): boolean {
    const mediaQuery = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    const getInitialState = () => mediaQuery?.matches ?? false;
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(getInitialState);

    useEffect(() => {
        if (!mediaQuery) return;

        const handler = (e: MediaQueryListEvent) => {
            setPrefersReducedMotion(e.matches);
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [mediaQuery]);

    return prefersReducedMotion;
}

/**
 * VisuallyHidden Component
 * 
 * Hides content visually but keeps it accessible to screen readers
 */
export const VisuallyHidden: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span
        style={{
            position: 'absolute',
            width: '1px',
            height: '1px',
            padding: 0,
            margin: '-1px',
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0
        }}
    >
        {children}
    </span>
);

/**
 * SkipLink Component
 * 
 * Provides a skip link for keyboard users to jump to main content
 */
export const SkipLink: React.FC<{ targetId: string }> = ({ targetId }) => (
    <a
        href={`#${targetId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:bg-brand-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
    >
        Skip to main content
    </a>
);

/**
 * Generate unique IDs for accessibility
 */
let idCounter = 0;
export function generateId(prefix: string = 'a11y'): string {
    return `${prefix}-${++idCounter}`;
}

/**
 * Get ARIA properties for a collapsible element
 */
export function getCollapsibleProps(isExpanded: boolean, id: string) {
    return {
        trigger: {
            'aria-expanded': isExpanded,
            'aria-controls': id,
        },
        content: {
            id,
            'aria-hidden': !isExpanded,
            hidden: !isExpanded,
        }
    };
}

/**
 * Get ARIA properties for a tab list
 */
export function getTabProps(
    selectedIndex: number,
    tabIndex: number,
    tabId: string,
    panelId: string
) {
    const isSelected = selectedIndex === tabIndex;

    return {
        tab: {
            role: 'tab' as const,
            'aria-selected': isSelected,
            'aria-controls': panelId,
            id: tabId,
            tabIndex: isSelected ? 0 : -1,
        },
        panel: {
            role: 'tabpanel' as const,
            'aria-labelledby': tabId,
            id: panelId,
            tabIndex: 0,
            hidden: !isSelected,
        }
    };
}
