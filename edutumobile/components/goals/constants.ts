export const PRIORITY_CONFIG = {
    high: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'High' },
    medium: { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)', label: 'Medium' },
    low: { color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', label: 'Low' },
} as const;

export const PRIORITY_OPTIONS = [
    { id: 'high', label: 'High', color: '#EF4444' },
    { id: 'medium', label: 'Medium', color: '#F59E0B' },
    { id: 'low', label: 'Low', color: '#10B981' },
] as const;

export const PRIORITY_OPTIONS_WITH_DESC = [
    { id: 'high', label: 'High Priority', color: '#EF4444', description: 'Urgent - needs immediate attention' },
    { id: 'medium', label: 'Medium Priority', color: '#F59E0B', description: 'Important - work on it soon' },
    { id: 'low', label: 'Low Priority', color: '#10B981', description: 'Can be done when you have time' },
] as const;

export const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export type Priority = 'high' | 'medium' | 'low';
