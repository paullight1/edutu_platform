import { HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  background,
  clipShape,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  resizable,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { TrendingPosterItem, TrendingPosterProps } from "./TrendingSpotlightWidget";

const DEFAULT_PROPS: TrendingPosterProps = { items: [] };
const TRENDING_LINK = "edutu://opportunities";

function palette(dark: boolean) {
  return dark
    ? { bg: "#171A4F", inset: "#232866", ink: "#FFFFFF", sub: "#C3CBEE", accent: "#9DB4FF" }
    : { bg: "#FFFFFF", inset: "#EEF2FF", ink: "#101828", sub: "#475467", accent: "#3563E9" };
}

function urgencyInk(tone: string | undefined, dark: boolean): string {
  if (tone === "red") return dark ? "#F87171" : "#DC2626";
  if (tone === "amber") return dark ? "#FBBF24" : "#B45309";
  if (tone === "green") return dark ? "#34D399" : "#047857";
  return dark ? "#94A3B8" : "#64748B";
}

function EmptyState({ props, dark }: { props: TrendingPosterProps; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      {props.logoUri ? (
        <Image uiImage={props.logoUri} modifiers={[frame({ width: 20, height: 20 })]} />
      ) : (
        <Image systemName="flame.fill" size={18} color={p.accent} />
      )}
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

function ThumbRow({ item, dark }: { item: TrendingPosterItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <HStack spacing={10} modifiers={[widgetURL(item.deepLink || TRENDING_LINK)]}>
      {item.imageUri ? (
        <Image
          uiImage={item.imageUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: "fill" }),
            frame({ width: 44, height: 44 }),
            clipShape("roundedRectangle", 10),
          ]}
        />
      ) : (
        <ZStack modifiers={[frame({ width: 44, height: 44 }), background(p.inset), cornerRadius(10)]}>
          <Image systemName="flame.fill" size={16} color={p.accent} />
        </ZStack>
      )}
      <VStack alignment="leading" spacing={2}>
        <Text
          modifiers={[
            font({ size: 13, weight: "semibold" }),
            foregroundStyle(p.ink),
            lineLimit(1),
            truncationMode("tail"),
          ]}
        >
          {item.title}
        </Text>
        <Text
          modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}
        >
          {item.organization || item.category}
        </Text>
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(urgencyInk(item.tone, dark)), lineLimit(1)]}>
        {item.deadline}
      </Text>
    </HStack>
  );
}

function TrendingThumbListLayout(props: TrendingPosterProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";
  if (!merged.items.length) return <EmptyState props={merged} dark={dark} />;

  const p = palette(dark);
  const maxRows = environment.widgetFamily === "systemLarge" ? 5 : 3;
  const rows = merged.items.slice(0, maxRows);

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      <HStack spacing={8}>
        {merged.logoUri ? (
          <Image uiImage={merged.logoUri} modifiers={[frame({ width: 18, height: 18 })]} />
        ) : (
          <Image systemName="flame.fill" size={15} color={p.accent} />
        )}
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
          Trending now
        </Text>
        <Spacer />
        <Image systemName="flame.fill" size={13} color="#FBBF24" />
      </HStack>
      {rows[0] ? <ThumbRow item={rows[0]} dark={dark} /> : null}
      {rows[1] ? <ThumbRow item={rows[1]} dark={dark} /> : null}
      {rows[2] ? <ThumbRow item={rows[2]} dark={dark} /> : null}
      {rows[3] ? <ThumbRow item={rows[3]} dark={dark} /> : null}
      {rows[4] ? <ThumbRow item={rows[4]} dark={dark} /> : null}
      <Spacer />
    </VStack>
  );
}

const TrendingThumbListWidget = createWidget<TrendingPosterProps>(
  "TrendingThumbListWidget",
  TrendingThumbListLayout,
);

TrendingThumbListWidget.updateSnapshot(DEFAULT_PROPS);

export function updateTrendingThumbListWidget(props: TrendingPosterProps) {
  TrendingThumbListWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateTrendingThumbListWidgetTimeline(
  entries: Array<{ date: Date; props: TrendingPosterProps }>,
) {
  if (!entries.length) return;
  TrendingThumbListWidget.updateTimeline(
    entries.map((entry) => ({ date: entry.date, props: { ...DEFAULT_PROPS, ...entry.props } })),
  );
}

export default TrendingThumbListWidget;
