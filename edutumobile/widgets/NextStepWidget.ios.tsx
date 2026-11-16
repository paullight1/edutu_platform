import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, cornerRadius, font, foregroundStyle, frame, lineLimit, padding, truncationMode, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import type { NextStepWidgetProps } from './NextStepWidget';

const DEFAULT_PROPS: NextStepWidgetProps = { items: [], state: 'unavailable' };
function NextStepWidgetLayout(props: NextStepWidgetProps, environment: WidgetEnvironment) {
  'widget';
  const data = { ...DEFAULT_PROPS, ...props };
  const small = environment.widgetFamily === 'systemSmall';
  const large = environment.widgetFamily === 'systemLarge';
  const dark = environment.colorScheme === 'dark';
  const p = dark ? { bg: '#171A4F', ink: '#FFFFFF', sub: '#C3CBEE', accent: '#9DB4FF', inset: '#232866' }
    : { bg: '#FFFFFF', ink: '#101828', sub: '#475467', accent: '#3563E9', inset: '#EEF2FF' };
  const hero = data.state === 'ready' ? data.items[0] : undefined;
  const second = data.items[1];
  const link = hero?.deepLink || 'edutu://my-plan';
  const emptyTitle = data.state === 'signed_out' ? 'Sign in to see your next step' : data.state === 'empty' ? 'Make room for your next opportunity' : 'Your plan needs a refresh';
  return <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 12 }), background(p.bg), widgetURL(link)]}>
    <HStack spacing={6}>
      <Text modifiers={[font({ size: 9, weight: 'bold' }), foregroundStyle(p.accent), lineLimit(1)]}>TODAY’S NEXT STEP</Text>
      <Spacer />
      {data.mascotUri ? <Image uiImage={data.mascotUri} modifiers={[frame({ width: 20, height: 20 })]} /> : <Image systemName="checklist" size={20} color={p.accent} />}
    </HStack>
    <Text modifiers={[font({ size: small ? 14 : large ? 18 : 16, weight: 'bold' }), foregroundStyle(p.ink), lineLimit(2), truncationMode('tail')]}>{hero?.title || emptyTitle}</Text>
    {!small ? <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(1), truncationMode('tail')]}>{hero ? `${data.stale ? 'Cached · ' : ''}${hero.opportunity}${hero.total > 0 ? ` · ${hero.completed} of ${hero.total} steps complete` : ''}` : 'Add an application to My Plan to see your next task.'}</Text> : null}
    {large && data.stale ? <Text modifiers={[font({ size: 10 }), foregroundStyle(p.sub), lineLimit(1)]}>Cached plan · Open to refresh</Text> : null}
    <Spacer />
    {large && hero && second ? <VStack alignment="leading" spacing={5} modifiers={[padding({ all: 8 }), background(p.inset), cornerRadius(12), widgetURL(second.deepLink)]}>
      <Text modifiers={[font({ size: 10 }), foregroundStyle(p.sub)]}>Up next</Text>
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(p.ink), lineLimit(1)]}>{second.title}</Text>
    </VStack> : null}
    <HStack modifiers={[frame({ maxWidth: 2000, minHeight: 44 }), background(p.inset), cornerRadius(12)]}>
      <Spacer /><Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(p.accent), lineLimit(1)]}>{hero ? 'Continue →' : 'Open My Plan →'}</Text><Spacer />
    </HStack>
  </VStack>;
}
const NextStepWidget = createWidget<NextStepWidgetProps>('NextStepWidget', NextStepWidgetLayout);
NextStepWidget.updateSnapshot(DEFAULT_PROPS);
export function updateNextStepWidget(props: NextStepWidgetProps) {
  if (props.state !== 'ready' || !props.items.length) {
    NextStepWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
    return;
  }
  const now = new Date();
  const entries = Array.from({ length: 15 }, (_, day) => {
    const date = new Date(now);
    if (day > 0) { date.setDate(date.getDate() + day); date.setHours(0, 0, 0, 0); }
    const items = props.items.filter(item => {
      if (!item.deadline) return true;
      const deadline = new Date(item.deadline); deadline.setHours(23, 59, 59, 999);
      return Number.isNaN(deadline.getTime()) || deadline >= date;
    });
    return { date, props: { ...props, items, state: items.length ? 'ready' as const : 'empty' as const, stale: props.stale || day > 0 } };
  });
  NextStepWidget.updateTimeline(entries);
}
export default NextStepWidget;
