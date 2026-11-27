import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import type { LiveActivityEnvironment, LiveActivityFactory, LiveActivityLayout } from 'expo-widgets';
import type { AutoApplyActivityProps } from './AutoApplyActivity';

function layout(props: AutoApplyActivityProps, environment: LiveActivityEnvironment): LiveActivityLayout {
  'widget';
  const status = environment.isStale && !props.actionRequired ? 'Open Edutu for current status' : props.status;
  const icon = props.actionRequired ? 'exclamationmark.circle.fill' : 'doc.text';
  const color = props.actionRequired ? '#FFC784' : '#C4B8FF';
  const title = props.title || 'Edutu Auto Apply';
  return {
    banner: (
      <HStack spacing={10} modifiers={[padding({ horizontal: 16, vertical: 14 })]}>
        <Image systemName={icon} size={22} color={color} />
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{title}</Text>
          <Text modifiers={[font({ size: 13 })]}>{status}</Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName={icon} size={14} color={color} />,
    compactTrailing: <Text modifiers={[font({ size: 11 }), foregroundStyle(color)]}>
      {props.actionRequired ? 'Action' : 'Edutu'}
    </Text>,
    minimal: <Image systemName={icon} size={14} color={color} />,
    expandedLeading: <Image systemName={icon} size={20} color={color} />,
    expandedBottom: (
      <VStack alignment="leading" modifiers={[padding({ horizontal: 10, vertical: 6 })]}>
        <Text modifiers={[font({ size: 14, weight: 'bold' }), lineLimit(1)]}>{title}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(2)]}>{status}</Text>
      </VStack>
    ),
  };
}

let factory: LiveActivityFactory<AutoApplyActivityProps> | undefined;
export function getAutoApplyActivityFactory() {
  const { createLiveActivity } = require('expo-widgets') as typeof import('expo-widgets');
  return factory ??= createLiveActivity('AutoApplyProgress', layout);
}
