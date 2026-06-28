/**
 * Native Widget Configuration
 *
 * Configures home screen widgets (iOS + Android) for opportunity display.
 * Widgets show upcoming deadlines, match scores, and quick actions.
 */

export type WidgetSize = 'small' | 'medium' | 'large';
export type WidgetContent = 'opportunities' | 'saved' | 'deadlines' | 'quick_actions';

export interface WidgetConfig {
  id: string;
  size: WidgetSize;
  content: WidgetContent;
  title: string;
  maxItems: number;
  showDeadline: boolean;
  showMatchScore: boolean;
  refreshIntervalMinutes: number;
  deepLink: string;
  darkMode: boolean;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'widget-opportunities-small',
    size: 'small',
    content: 'opportunities',
    title: 'Top Match',
    maxItems: 1,
    showDeadline: true,
    showMatchScore: true,
    refreshIntervalMinutes: 30,
    deepLink: 'edutu://opportunities',
    darkMode: true,
  },
  {
    id: 'widget-opportunities-medium',
    size: 'medium',
    content: 'opportunities',
    title: 'Recommended',
    maxItems: 3,
    showDeadline: true,
    showMatchScore: true,
    refreshIntervalMinutes: 30,
    deepLink: 'edutu://opportunities',
    darkMode: true,
  },
  {
    id: 'widget-deadlines-medium',
    size: 'medium',
    content: 'deadlines',
    title: 'Upcoming Deadlines',
    maxItems: 3,
    showDeadline: true,
    showMatchScore: false,
    refreshIntervalMinutes: 60,
    deepLink: 'edutu://deadlines',
    darkMode: true,
  },
  {
    id: 'widget-quick-actions-small',
    size: 'small',
    content: 'quick_actions',
    title: 'Quick Actions',
    maxItems: 2,
    showDeadline: false,
    showMatchScore: false,
    refreshIntervalMinutes: 120,
    deepLink: 'edutu://home',
    darkMode: true,
  },
];

export const WIDGET_SIZE_SPECS: Record<WidgetSize, { width: number; height: number; maxItems: number }> = {
  small: { width: 160, height: 160, maxItems: 1 },
  medium: { width: 340, height: 160, maxItems: 3 },
  large: { width: 340, height: 340, maxItems: 5 },
};

/**
 * Get widgets filtered by content type.
 */
export function getWidgetsByContent(content: WidgetContent): WidgetConfig[] {
  return DEFAULT_WIDGETS.filter((w) => w.content === content);
}

/**
 * Get all available widget configurations.
 */
export function getAvailableWidgets(): WidgetConfig[] {
  return DEFAULT_WIDGETS;
}
