import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
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

import type { TrendingWidgetItem, TrendingWidgetProps } from "./TrendingWidget";

const DEFAULT_PROPS: TrendingWidgetProps = {
  items: [],
};

const TRENDING_LINK = "edutu://opportunities";

function palette(dark: boolean) {
  return dark
    ? {
        bg: "#171A4F",
        ink: "#FFFFFF",
        sub: "#C3CBEE",
        faint: "#8A90C0",
        accent: "#9DB4FF",
        flame: "#FBBF24",
      }
    : {
        bg: "#FFFFFF",
        ink: "#101828",
        sub: "#475467",
        faint: "#667085",
        accent: "#3563E9",
        flame: "#B45309",
      };
}

function urgencyInk(tone: string | undefined, dark: boolean): string {
  if (tone === "red") return dark ? "#F87171" : "#DC2626";
  if (tone === "amber") return dark ? "#FBBF24" : "#B45309";
  if (tone === "green") return dark ? "#34D399" : "#047857";
  return dark ? "#94A3B8" : "#64748B";
}

function LogoMark({ uri, size, color }: { uri?: string; size: number; color: string }) {
  if (uri) {
    return <Image uiImage={uri} modifiers={[frame({ width: size, height: size })]} />;
  }
  return <Image systemName="flame.fill" size={size - 2} color={color} />;
}

function EmptyState({ props, dark }: { props: TrendingWidgetProps; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      <LogoMark uri={props.logoUri} size={20} color={p.accent} />
      <Spacer />
      <Text modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle(p.ink), lineLimit(2)]}>
        Discover what&apos;s hot
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(2)]}>
        Open Edutu to load trending opportunities.
      </Text>
    </VStack>
  );
}

/** Small: the #1 trending opportunity as a poster. */
function SystemSmall(props: TrendingWidgetProps & { dark: boolean }) {
  const p = palette(props.dark);
  const hero = props.items[0];
  if (!hero) return <EmptyState props={props} dark={props.dark} />;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        background(p.bg),
        widgetURL(hero.deepLink || TRENDING_LINK),
      ]}
    >
      <HStack spacing={6}>
        <LogoMark uri={props.logoUri} size={20} color={p.accent} />
        <Spacer />
        <Image systemName="flame.fill" size={14} color={p.flame} />
        <Text modifiers={[font({ size: 10, weight: "bold" }), foregroundStyle(p.flame), lineLimit(1)]}>
          Trending
        </Text>
      </HStack>
      <Text
        modifiers={[
          font({ size: 15, weight: "bold" }),
          foregroundStyle(p.ink),
          lineLimit(3),
          truncationMode("tail"),
        ]}
      >
        {hero.title}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}>
        {hero.category}
      </Text>
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(urgencyInk(hero.tone, props.dark)), lineLimit(1)]}>
        {hero.deadline}
      </Text>
    </VStack>
  );
}

function TrendRow({ item, rank, dark }: { item: TrendingWidgetItem; rank: string; dark: boolean }) {
  const p = palette(dark);
  return (
    <HStack alignment="center" spacing={10} modifiers={[widgetURL(item.deepLink || TRENDING_LINK)]}>
      <Text modifiers={[font({ size: 15, weight: "bold" }), foregroundStyle(p.accent), frame({ width: 18 })]}>
        {rank}
      </Text>
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(1), truncationMode("tail")]}>
          {item.title}
        </Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}>
          {item.organization}
        </Text>
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(urgencyInk(item.tone, dark)), lineLimit(1)]}>
        {item.deadline}
      </Text>
    </HStack>
  );
}

/** Medium/large: what's hot across Edutu right now, ranked. */
function TrendList(props: TrendingWidgetProps & { dark: boolean; maxRows: number }) {
  const p = palette(props.dark);
  if (!props.items.length) return <EmptyState props={props} dark={props.dark} />;

  const items = props.items;

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      <HStack spacing={8}>
        <LogoMark uri={props.logoUri} size={18} color={p.accent} />
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
          Trending now
        </Text>
        <Spacer />
        <Image systemName="flame.fill" size={13} color={p.flame} />
      </HStack>
      <TrendRow item={items[0]} rank="1" dark={props.dark} />
      {items[1] ? <TrendRow item={items[1]} rank="2" dark={props.dark} /> : null}
      {props.maxRows > 2 && items[2] ? <TrendRow item={items[2]} rank="3" dark={props.dark} /> : null}
      {props.maxRows > 3 && items[3] ? <TrendRow item={items[3]} rank="4" dark={props.dark} /> : null}
      {props.maxRows > 4 && items[4] ? <TrendRow item={items[4]} rank="5" dark={props.dark} /> : null}
      {props.maxRows > 5 && items[5] ? <TrendRow item={items[5]} rank="6" dark={props.dark} /> : null}
      <Spacer />
    </VStack>
  );
}

function TrendingWidgetLayout(props: TrendingWidgetProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";

  if (environment.widgetFamily === "systemSmall") {
    return <SystemSmall {...merged} dark={dark} />;
  }

  if (environment.widgetFamily === "systemMedium") {
    return <TrendList {...merged} dark={dark} maxRows={3} />;
  }

  return <TrendList {...merged} dark={dark} maxRows={6} />;
}

const TrendingWidget = createWidget<TrendingWidgetProps>("TrendingWidget", TrendingWidgetLayout);

TrendingWidget.updateSnapshot(DEFAULT_PROPS);

export function updateTrendingWidget(props: TrendingWidgetProps) {
  TrendingWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateTrendingWidgetTimeline(
  entries: Array<{ date: Date; props: TrendingWidgetProps }>,
) {
  if (!entries.length) return;
  TrendingWidget.updateTimeline(
    entries.map((entry) => ({
      date: entry.date,
      props: { ...DEFAULT_PROPS, ...entry.props },
    })),
  );
}

export default TrendingWidget;
