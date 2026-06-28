import React from 'react';
import { View, AccessibilityProps, ViewProps } from 'react-native';

interface AccessibleViewProps extends ViewProps {
  label?: string;
  hint?: string;
  accessibilityRoleOverride?: AccessibilityProps['accessibilityRole'];
  isHeader?: boolean;
  isButton?: boolean;
  isSelected?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * Accessibility wrapper that applies proper screen reader labels,
 * roles, and states. Use instead of plain <View> for interactive
 * and semantic elements.
 */
export function AccessibleView({
  label,
  hint,
  accessibilityRoleOverride,
  isHeader,
  isButton,
  isSelected,
  disabled,
  children,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole,
  accessibilityState,
  ...props
}: AccessibleViewProps) {
  const resolvedRole = accessibilityRoleOverride || accessibilityRole || (isHeader ? 'header' : isButton ? 'button' : undefined);
  const resolvedState = {
    ...(accessibilityState as Record<string, unknown>),
    ...(isSelected !== undefined && { selected: isSelected }),
    ...(disabled !== undefined && { disabled }),
  };

  return (
    <View
      {...props}
      accessible={!!label || isButton}
      accessibilityLabel={label || accessibilityLabel}
      accessibilityHint={hint || accessibilityHint}
      accessibilityRole={resolvedRole}
      accessibilityState={Object.keys(resolvedState).length > 0 ? resolvedState : undefined}
    >
      {children}
    </View>
  );
}

/**
 * Accessibility wrapper for touchable/pressable elements.
 * Always sets accessible=true and button role.
 */
export function AccessibleTouchable({
  label,
  hint,
  disabled,
  isSelected,
  children,
  ...props
}: AccessibleViewProps & { onPress: () => void }) {
  return (
    <AccessibleView
      {...props}
      label={label}
      hint={hint}
      accessibilityRoleOverride="button"
      isButton
      isSelected={isSelected}
      disabled={disabled}
      accessible
    >
      {children}
    </AccessibleView>
  );
}
