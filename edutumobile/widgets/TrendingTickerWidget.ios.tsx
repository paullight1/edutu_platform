import { HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  aspectRatio,
  background,
  clipped,
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
    ? { bg: "#171A4F", ink: "#FFFFFF", sub: "#C3CBEE", accent: "#9DB4FF" }
    : { bg: "#FFFFFF", ink: "#101828", sub: "#475467", accent: "#3563E9" };
}

function EmptyState({ props, dark }: { props: TrendingPosterProps; dark: boolean }) {
  const p = palette(dark);
  return (
    <HStack
      spacing={10}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(TRENDING_LINK)]}
    >
      {props.logoUri ? (
        <Image uiImage={props.logoUri} modifiers={[frame({ width: 22, height: 22 })]} />
      ) : (
        <Image systemName="flame.fill" size={20} color={p.accent} />
      )}
      <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
        Discover what&apos;s hot on Edutu
      </Text>
      <Spacer />
    </HStack>
  );
}

/** Wide banner: hero photo behind a one-line headline + deadline. */
function Ticker({ item, dark }: { item: TrendingPosterItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <ZStack modifiers={[background(p.bg), widgetURL(item.deepLink || TRENDING_LINK)]}>
      {item.imageUri ? (
        <Image
          uiImage={item.imageUri}
          modifiers={[
            resizable(),
            aspectRatio({ contentMode: "fill" }),
            frame({ maxWidth: FILL, maxHeight: FILL }),
            clipped(),
            overlay({ color: "#00000080" }),
          ]}
        />
      ) : null}

      <VStack alignment="leading" spacing={4} modifiers={[padding({ horizontal: 16, vertical: 12 })]}>
        <HStack spacing={5}>
          <Image systemName="flame.fill" size={11} color="#FBBF24" />
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle("#FBBF24"),
              lineLimit(1),
            ]}
          >
            Trending now
          </Text>
          <Spacer />
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: 16, weight: "bold" }),
            foregroundStyle("#FFFFFF"),
            lineLimit(2),
            truncationMode("tail"),
          ]}
        >
          {item.title}
        </Text>
        <HStack spacing={8}>
          <Text modifiers={[font({ size: 11 }), foregroundStyle("#DCE2FF"), lineLimit(1), truncationMode("tail")]}>
            {item.organization || item.category}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle("#FFFFFF"), lineLimit(1)]}>
            {item.deadline}
          </Text>
        </HStack>
      </VStack>
    </ZStack>
  );
}

function TrendingTickerLayout(props: TrendingPosterProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";
  const hero = merged.items[0];
  if (!hero) return <EmptyState props={merged} dark={dark} />;
  return <Ticker item={hero} dark={dark} />;
}

const TrendingTickerWidget = createWidget<TrendingPosterProps>(
  "TrendingTickerWidget",
  TrendingTickerLayout,
);

TrendingTickerWidget.updateSnapshot(DEFAULT_PROPS);

export function updateTrendingTickerWidget(props: TrendingPosterProps) {
  TrendingTickerWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateTrendingTickerWidgetTimeline(
  entries: Array<{ date: Date; props: TrendingPosterProps }>,
) {
  if (!entries.length) return;
  TrendingTickerWidget.updateTimeline(
    entries.map((entry) => ({ date: entry.date, props: { ...DEFAULT_PROPS, ...entry.props } })),
  );
}

export default TrendingTickerWidget;
