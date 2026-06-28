import { AccessoryWidgetBackground, HStack, Image, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { OpportunityWidgetProps } from "./OpportunityWidget";

const DEFAULT_OPPORTUNITY: OpportunityWidgetProps = {
  title: "Find your next scholarship",
  provider: "Edutu",
  deadline: "Open now",
  category: "Opportunity",
  location: "Global",
  deepLink: "edutu://opportunities",
  items: [],
};

type RenderableWidgetItem = NonNullable<OpportunityWidgetProps["items"]>[number];

function getWidgetItems(props: OpportunityWidgetProps): RenderableWidgetItem[] {
  const items = props.items?.length
    ? props.items
    : [{
      title: props.title,
      provider: props.provider,
      deadline: props.deadline,
      category: props.category,
      location: props.location,
      match: props.match,
      deepLink: props.deepLink,
    }];

  return items.slice(0, 5);
}

function getWidgetLink(props: OpportunityWidgetProps, fallbackItem?: RenderableWidgetItem): string {
  return fallbackItem?.deepLink || props.deepLink || "edutu://opportunities";
}

function MatchText({ match, dark = false }: { match?: number; dark?: boolean }) {
  return (
    <Text
      modifiers={[
        font({ size: 11, weight: "bold" }),
        foregroundStyle(dark ? "#FFFFFF" : "#173B8F"),
        background(dark ? "#3563E9" : "#E2EAFF"),
        padding({ horizontal: 7, vertical: 3 }),
        lineLimit(1),
      ]}
    >
      {match ? `${match}% match` : "Top pick"}
    </Text>
  );
}

function DeadlineText({ children, compact = false }: { children: string; compact?: boolean }) {
  return (
    <Text
      modifiers={[
        font({ size: compact ? 11 : 12, weight: "semibold" }),
        foregroundStyle("#FFFFFF"),
        background("#3563E9"),
        padding({ horizontal: compact ? 6 : 8, vertical: compact ? 2 : 4 }),
        lineLimit(1),
        truncationMode("tail"),
      ]}
    >
      {children}
    </Text>
  );
}

function AccessoryLayout(props: OpportunityWidgetProps, environment: WidgetEnvironment) {
  if (environment.widgetFamily === "accessoryInline") {
    return (
      <Text modifiers={[font({ size: 12, weight: "semibold" }), lineLimit(1)]}>
        Edutu: {props.title} - {props.deadline}
      </Text>
    );
  }

  if (environment.widgetFamily === "accessoryCircular") {
    return (
      <ZStack modifiers={[widgetURL(getWidgetLink(props))]}>
        <AccessoryWidgetBackground />
        <VStack alignment="center" spacing={2}>
          <Image systemName="graduationcap.fill" size={17} color="#3563E9" />
          <Text modifiers={[font({ size: 9, weight: "bold" }), lineLimit(1)]}>Edutu</Text>
        </VStack>
      </ZStack>
    );
  }

  return (
    <ZStack modifiers={[widgetURL(getWidgetLink(props))]}>
      <AccessoryWidgetBackground />
      <VStack alignment="leading" spacing={2} modifiers={[padding({ horizontal: 8, vertical: 4 })]}>
        <Text modifiers={[font({ size: 12, weight: "bold" }), lineLimit(1), truncationMode("tail")]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
          {props.deadline}
        </Text>
      </VStack>
    </ZStack>
  );
}

function SystemSmall(props: OpportunityWidgetProps) {
  const items = getWidgetItems(props);
  const hero = items[0] ?? {
    title: props.title,
    provider: props.provider,
    deadline: props.deadline,
    category: props.category,
    location: props.location,
    match: props.match,
    deepLink: props.deepLink,
  };

  return (
    <VStack
      alignment="leading"
      spacing={9}
      modifiers={[
        padding({ all: 14 }),
        background("#F7FAFF"),
        widgetURL(getWidgetLink(props, hero)),
      ]}
    >
      <HStack spacing={6}>
        <Image systemName="sparkles" size={16} color="#3563E9" />
        <Text modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle("#173B8F"), lineLimit(1)]}>Today on Edutu</Text>
      </HStack>
      <MatchText match={hero.match} />
      <Text modifiers={[font({ size: 16, weight: "bold" }), foregroundStyle("#101828"), lineLimit(3), truncationMode("tail")]}>
        {hero.title}
      </Text>
      <DeadlineText compact>{hero.deadline}</DeadlineText>
    </VStack>
  );
}

function SystemMedium(props: OpportunityWidgetProps) {
  const items = getWidgetItems(props);
  const hero = items[0] ?? {
    title: props.title,
    provider: props.provider,
    deadline: props.deadline,
    category: props.category,
    location: props.location,
    match: props.match,
    deepLink: props.deepLink,
  };
  const next = items[1];

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        padding({ all: 16 }),
        background("#101828"),
        widgetURL(getWidgetLink(props, hero)),
      ]}
    >
      <HStack spacing={8}>
        <MatchText match={hero.match} dark />
        <Text modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle("#DCE7FF"), lineLimit(1), truncationMode("tail")]}>
          {hero.category}
        </Text>
      </HStack>
      <Text modifiers={[font({ size: 22, weight: "bold" }), foregroundStyle("#FFFFFF"), lineLimit(2), truncationMode("tail")]}>
        {hero.title}
      </Text>
      <HStack spacing={8}>
        <DeadlineText>{hero.deadline}</DeadlineText>
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle("#C7D2FE"), lineLimit(1), truncationMode("tail")]}>
          {hero.provider}
        </Text>
      </HStack>
      {next ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle("#98A2B3"), lineLimit(1), truncationMode("tail")]}>
          Next: {next.title}
        </Text>
      ) : null}
    </VStack>
  );
}

function SystemLarge(props: OpportunityWidgetProps) {
  const items = getWidgetItems(props);
  const first = items[0] ?? {
    title: props.title,
    provider: props.provider,
    deadline: props.deadline,
    category: props.category,
    location: props.location,
    match: props.match,
    deepLink: props.deepLink,
  };
  const second = items[1];
  const third = items[2];
  const fourth = items[3];

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        padding({ all: 18 }),
        background("#F7FAFF"),
        widgetURL(getWidgetLink(props, first)),
      ]}
    >
      <HStack spacing={8}>
        <Image systemName="graduationcap.fill" size={24} color="#3563E9" />
        <VStack alignment="leading" spacing={1}>
          <Text modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle("#173B8F")]}>Edutu Opportunity Radar</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle("#667085"), lineLimit(1)]}>Best matches and closing dates</Text>
        </VStack>
      </HStack>
      <WidgetListRow item={first} rank="1" />
      {second ? <WidgetListRow item={second} rank="2" /> : null}
      {third ? <WidgetListRow item={third} rank="3" /> : null}
      {fourth ? <WidgetListRow item={fourth} rank="4" /> : null}
    </VStack>
  );
}

function WidgetListRow({ item, rank }: { item: RenderableWidgetItem; rank: string }) {
  return (
    <HStack alignment="center" spacing={9} modifiers={[widgetURL(item.deepLink || "edutu://opportunities")]}>
      <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle("#3563E9"), frame({ width: 18 })]}>
        {rank}
      </Text>
      <VStack alignment="leading" spacing={3}>
        <Text modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle("#101828"), lineLimit(1), truncationMode("tail")]}>
          {item.title}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle("#667085"), lineLimit(1), truncationMode("tail")]}>
          {item.match ? `${item.match}%` : item.category} - {item.deadline}
        </Text>
      </VStack>
    </HStack>
  );
}

function OpportunityWidgetLayout(props: OpportunityWidgetProps, environment: WidgetEnvironment) {
  "widget";

  const opportunity = { ...DEFAULT_OPPORTUNITY, ...props };

  if (environment.widgetFamily.startsWith("accessory")) {
    return AccessoryLayout(opportunity, environment);
  }

  if (environment.widgetFamily === "systemSmall") {
    return <SystemSmall {...opportunity} />;
  }

  if (environment.widgetFamily === "systemMedium") {
    return <SystemMedium {...opportunity} />;
  }

  return <SystemLarge {...opportunity} />;
}

const OpportunityWidget = createWidget<OpportunityWidgetProps>(
  "OpportunityWidget",
  OpportunityWidgetLayout
);

OpportunityWidget.updateSnapshot(DEFAULT_OPPORTUNITY);

export function updateOpportunityWidget(props: OpportunityWidgetProps) {
  OpportunityWidget.updateSnapshot({ ...DEFAULT_OPPORTUNITY, ...props });
}

export default OpportunityWidget;
