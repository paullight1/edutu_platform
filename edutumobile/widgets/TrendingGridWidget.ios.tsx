import { HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  background,
  clipped,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  overlay,
  padding,
  resizable,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { TrendingPosterItem, TrendingPosterProps } from "./TrendingSpotlightWidget";

const DEFAULT_PROPS: TrendingPosterProps = { items: [] };
const TRENDING_LINK = "edutu://opportunities";
const FILL = 2000;

function palette(dark: boolean) {
  return dark
    ? { bg: "#171A4F", inset: "#232866", ink: "#FFFFFF", sub: "#C3CBEE", accent: "#9DB4FF" }
    : { bg: "#FFFFFF", inset: "#EEF2FF", ink: "#101828", sub: "#475467", accent: "#3563E9" };
}

function EmptyState({ props, dark }: { props: TrendingPosterProps; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="center"
      spacing={8}
      modifiers={[padding({ all: 16 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      <Spacer />
      {props.logoUri ? (
        <Image uiImage={props.logoUri} modifiers={[frame({ width: 26, height: 26 })]} />
      ) : (
        <Image systemName="flame.fill" size={24} color={p.accent} />
      )}
      <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(p.ink), lineLimit(2)]}>
        Discover what&apos;s hot
      </Text>
      <Spacer />
    </VStack>
  );
}

function Tile({ item, dark }: { item?: TrendingPosterItem; dark: boolean }) {
  const p = palette(dark);

  if (!item) {
    return (
      <ZStack
        modifiers={[
          frame({ maxWidth: FILL, maxHeight: FILL }),
          background(p.inset),
          cornerRadius(12),
        ]}
      >
        <Image systemName="flame.fill" size={16} color={p.accent} />
      </ZStack>
    );
  }

  return (
    <ZStack
      modifiers={[
        frame({ maxWidth: FILL, maxHeight: FILL }),
        background(p.inset),
        cornerRadius(12),
        widgetURL(item.deepLink || TRENDING_LINK),
      ]}
    >
      {item.imageUri ? (
        <Image
          uiImage={item.imageUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: "fill" }),
            frame({ maxWidth: FILL, maxHeight: FILL }),
            clipped(),
            overlay({ color: "#0000007D" }),
          ]}
        />
      ) : null}
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 9 })]}>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 12, weight: "bold" }),
            foregroundStyle("#FFFFFF"),
            lineLimit(2),
            truncationMode("tail"),
          ]}
        >
          {item.title}
        </Text>
        <Text modifiers={[font({ size: 9, weight: "semibold" }), foregroundStyle("#F2F4FF"), lineLimit(1)]}>
          {item.deadline}
        </Text>
      </VStack>
    </ZStack>
  );
}

function TrendingGridLayout(props: TrendingPosterProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";
  const items = merged.items;

  if (!items.length) return <EmptyState props={merged} dark={dark} />;

  const p = palette(dark);
  return (
    <VStack spacing={6} modifiers={[padding({ all: 8 }), background(p.bg)]}>
      <HStack spacing={6} modifiers={[frame({ maxWidth: FILL, maxHeight: FILL })]}>
        <Tile item={items[0]} dark={dark} />
        <Tile item={items[1]} dark={dark} />
      </HStack>
      <HStack spacing={6} modifiers={[frame({ maxWidth: FILL, maxHeight: FILL })]}>
        <Tile item={items[2]} dark={dark} />
        <Tile item={items[3]} dark={dark} />
      </HStack>
    </VStack>
  );
}

const TrendingGridWidget = createWidget<TrendingPosterProps>("TrendingGridWidget", TrendingGridLayout);

TrendingGridWidget.updateSnapshot(DEFAULT_PROPS);

export function updateTrendingGridWidget(props: TrendingPosterProps) {
  TrendingGridWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateTrendingGridWidgetTimeline(
  entries: Array<{ date: Date; props: TrendingPosterProps }>,
) {
  if (!entries.length) return;
  TrendingGridWidget.updateTimeline(
    entries.map((entry) => ({ date: entry.date, props: { ...DEFAULT_PROPS, ...entry.props } })),
  );
}

export default TrendingGridWidget;
