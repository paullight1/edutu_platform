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

// A large finite cap stands in for `.infinity` so the poster photo fills the
// whole widget before it's clipped to the rounded container.
const FILL = 2000;

function palette(dark: boolean) {
  return dark
    ? { bg: "#171A4F", ink: "#FFFFFF", sub: "#C3CBEE", accent: "#9DB4FF", flame: "#FBBF24" }
    : { bg: "#FFFFFF", ink: "#101828", sub: "#475467", accent: "#3563E9", flame: "#B45309" };
}

function LogoMark({ uri, size, color }: { uri?: string; size: number; color: string }) {
  if (uri) {
    return <Image uiImage={uri} modifiers={[frame({ width: size, height: size })]} />;
  }
  return <Image systemName="flame.fill" size={size - 2} color={color} />;
}

function EmptyState({ props, dark }: { props: TrendingPosterProps; dark: boolean }) {
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

/** One full-bleed poster: photo + dark scrim + category / title / deadline. */
function Poster({
  item,
  dark,
  titleSize,
}: {
  item: TrendingPosterItem;
  dark: boolean;
  titleSize: number;
}) {
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
            overlay({ color: "#00000073" }),
          ]}
        />
      ) : null}

      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 14 })]}>
        <HStack spacing={5}>
          <Image systemName="flame.fill" size={12} color="#FBBF24" />
          <Text
            modifiers={[
              font({ size: 10, weight: "bold" }),
              foregroundStyle("#FFFFFF"),
              padding({ horizontal: 8, vertical: 3 }),
              background("#FFFFFF26"),
              cornerRadius(999),
              lineLimit(1),
            ]}
          >
            {item.category}
          </Text>
          <Spacer />
        </HStack>
        <Spacer />
        <Text
          modifiers={[
            font({ size: titleSize, weight: "bold" }),
            foregroundStyle("#FFFFFF"),
            lineLimit(3),
            truncationMode("tail"),
          ]}
        >
          {item.title}
        </Text>
        <Text
          modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle("#F2F4FF"), lineLimit(1)]}
        >
          {item.deadline}
        </Text>
      </VStack>
    </ZStack>
  );
}

function TrendingSpotlightLayout(props: TrendingPosterProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";
  const hero = merged.items[0];

  if (!hero) return <EmptyState props={merged} dark={dark} />;

  const titleSize = environment.widgetFamily === "systemLarge" ? 22 : environment.widgetFamily === "systemMedium" ? 18 : 15;
  return <Poster item={hero} dark={dark} titleSize={titleSize} />;
}

const TrendingSpotlightWidget = createWidget<TrendingPosterProps>(
  "TrendingSpotlightWidget",
  TrendingSpotlightLayout,
);

TrendingSpotlightWidget.updateSnapshot(DEFAULT_PROPS);

export function updateTrendingSpotlightWidget(props: TrendingPosterProps) {
  TrendingSpotlightWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateTrendingSpotlightWidgetTimeline(
  entries: Array<{ date: Date; props: TrendingPosterProps }>,
) {
  if (!entries.length) return;
  TrendingSpotlightWidget.updateTimeline(
    entries.map((entry) => ({ date: entry.date, props: { ...DEFAULT_PROPS, ...entry.props } })),
  );
}

export default TrendingSpotlightWidget;
