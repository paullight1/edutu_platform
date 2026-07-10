import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
  clipShape,
  cornerRadius,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { OpportunityWidgetItem, OpportunityWidgetProps } from "./OpportunityWidget";

const DEFAULT_OPPORTUNITY: OpportunityWidgetProps = {
  title: "Find your next scholarship",
  provider: "Edutu",
  deadline: "Open now",
  category: "Opportunity",
  location: "Global",
  tone: "slate",
  daysLeft: null,
  deepLink: "edutu://opportunities",
  items: [],
};

// Inlined adaptive-navy palette (see widgets/theme.ts, the canonical source —
// the widget compiler only reliably sees this module, so tokens live here too).
function palette(dark: boolean) {
  return dark
    ? {
        bg: "#171A4F",
        bgInset: "#232866",
        ink: "#FFFFFF",
        sub: "#C3CBEE",
        faint: "#8A90C0",
        accent: "#9DB4FF",
        pillBg: "#3563E9",
        pillInk: "#FFFFFF",
      }
    : {
        bg: "#FFFFFF",
        bgInset: "#EEF2FF",
        ink: "#101828",
        sub: "#475467",
        faint: "#667085",
        accent: "#3563E9",
        pillBg: "#E2EAFF",
        pillInk: "#173B8F",
      };
}

// Deadline chips are their own surface: same fills in both themes, white text.
function chipFill(tone?: string): string {
  return tone === "red"
    ? "#E5484D"
    : tone === "amber"
      ? "#B45309"
      : tone === "green"
        ? "#047857"
        : "#475569";
}

// Urgency as text (list rows, rails) — tuned per surface for >= 4.5:1.
function urgencyInk(tone: string | undefined, dark: boolean): string {
  if (tone === "red") return dark ? "#F87171" : "#DC2626";
  if (tone === "amber") return dark ? "#FBBF24" : "#B45309";
  if (tone === "green") return dark ? "#34D399" : "#047857";
  return dark ? "#94A3B8" : "#64748B";
}

function getWidgetItems(props: OpportunityWidgetProps): OpportunityWidgetItem[] {
  const items = props.items?.length
    ? props.items
    : [{
      title: props.title,
      provider: props.provider,
      deadline: props.deadline,
      category: props.category,
      location: props.location,
      match: props.match,
      urgent: props.urgent,
      tone: props.tone,
      daysLeft: props.daysLeft,
      deepLink: props.deepLink,
    }];

  return items.slice(0, 6);
}

function getWidgetLink(props: OpportunityWidgetProps, fallbackItem?: OpportunityWidgetItem): string {
  return fallbackItem?.deepLink || props.deepLink || "edutu://opportunities";
}

/** The brand mark — logo image when synced, graduation cap until then. Never a wordmark. */
function LogoMark({ uri, size, color }: { uri?: string; size: number; color: string }) {
  if (uri) {
    return <Image uiImage={uri} modifiers={[frame({ width: size, height: size })]} />;
  }
  return <Image systemName="graduationcap.fill" size={size - 2} color={color} />;
}

function MatchPill({ match, dark }: { match?: number; dark: boolean }) {
  const p = palette(dark);
  return (
    <Text
      modifiers={[
        font({ size: 11, weight: "bold" }),
        foregroundStyle(p.pillInk),
        padding({ horizontal: 8, vertical: 3 }),
        background(p.pillBg),
        clipShape("capsule"),
        lineLimit(1),
      ]}
    >
      {match ? `${match}% match` : "Top pick"}
    </Text>
  );
}

function DeadlineChip({
  children,
  tone,
  compact = false,
}: {
  children: string;
  tone?: string;
  compact?: boolean;
}) {
  return (
    <Text
      modifiers={[
        font({ size: compact ? 11 : 12, weight: "semibold" }),
        foregroundStyle("#FFFFFF"),
        padding({ horizontal: compact ? 8 : 10, vertical: compact ? 3 : 4 }),
        background(chipFill(tone)),
        clipShape("capsule"),
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
        {props.deadline} · {props.title}
      </Text>
    );
  }

  if (environment.widgetFamily === "accessoryCircular") {
    const days = props.daysLeft;
    return (
      <ZStack modifiers={[widgetURL(getWidgetLink(props))]}>
        <AccessoryWidgetBackground />
        {typeof days === "number" && days >= 0 ? (
          <VStack alignment="center" spacing={0}>
            <Text modifiers={[font({ size: 20, weight: "bold" }), lineLimit(1)]}>
              {`${days}`}
            </Text>
            <Text modifiers={[font({ size: 9, weight: "semibold" }), lineLimit(1)]}>
              {days === 1 ? "day" : "days"}
            </Text>
          </VStack>
        ) : (
          <Image systemName="graduationcap.fill" size={18} />
        )}
      </ZStack>
    );
  }

  return (
    <ZStack modifiers={[widgetURL(getWidgetLink(props))]}>
      <AccessoryWidgetBackground />
      <VStack alignment="leading" spacing={2} modifiers={[padding({ horizontal: 8, vertical: 4 })]}>
        <Text modifiers={[font({ size: 12, weight: "bold" }), lineLimit(2), truncationMode("tail")]}>
          {props.title}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
          {props.deadline}
        </Text>
      </VStack>
    </ZStack>
  );
}

/** Small: one hero, poster-style. Logo top-left, match top-right, title, deadline. */
function SystemSmall(props: OpportunityWidgetProps & { dark: boolean }) {
  const p = palette(props.dark);
  const items = getWidgetItems(props);
  const hero = items[0];

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        padding({ all: 14 }),
        background(p.bg),
        widgetURL(getWidgetLink(props, hero)),
      ]}
    >
      <HStack spacing={6}>
        <LogoMark uri={props.logoUri} size={20} color={p.accent} />
        <Spacer />
        <MatchPill match={hero.match} dark={props.dark} />
      </HStack>
      <Text
        modifiers={[
          font({ size: 16, weight: "bold" }),
          foregroundStyle(p.ink),
          lineLimit(3),
          truncationMode("tail"),
        ]}
      >
        {hero.title}
      </Text>
      <Spacer />
      <DeadlineChip compact tone={hero.tone}>{hero.deadline}</DeadlineChip>
    </VStack>
  );
}

/** Medium: hero on the left, "Up next" rail on the right. */
function SystemMedium(props: OpportunityWidgetProps & { dark: boolean }) {
  const p = palette(props.dark);
  const items = getWidgetItems(props);
  const hero = items[0];
  const second = items[1];
  const third = items[2];

  return (
    <HStack
      spacing={12}
      modifiers={[
        padding({ all: 14 }),
        background(p.bg),
        widgetURL(getWidgetLink(props, hero)),
      ]}
    >
      <VStack alignment="leading" spacing={7}>
        <HStack spacing={7}>
          <LogoMark uri={props.logoUri} size={18} color={p.accent} />
          <MatchPill match={hero.match} dark={props.dark} />
        </HStack>
        <Text
          modifiers={[
            font({ size: 17, weight: "bold" }),
            foregroundStyle(p.ink),
            lineLimit(2),
            truncationMode("tail"),
          ]}
        >
          {hero.title}
        </Text>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}>
          {hero.provider}
        </Text>
        <Spacer />
        <DeadlineChip tone={hero.tone}>{hero.deadline}</DeadlineChip>
      </VStack>
      {second ? (
        <VStack
          alignment="leading"
          spacing={8}
          modifiers={[
            padding({ all: 10 }),
            background(p.bgInset),
            cornerRadius(14),
            frame({ width: 122 }),
          ]}
        >
          <Text modifiers={[font({ size: 10, weight: "semibold" }), foregroundStyle(p.faint), lineLimit(1)]}>
            Up next
          </Text>
          <RailRow item={second} dark={props.dark} />
          {third ? <RailRow item={third} dark={props.dark} /> : null}
          <Spacer />
        </VStack>
      ) : null}
    </HStack>
  );
}

function RailRow({ item, dark }: { item: OpportunityWidgetItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[widgetURL(item.deepLink || "edutu://opportunities")]}
    >
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(2), truncationMode("tail")]}>
        {item.title}
      </Text>
      <Text modifiers={[font({ size: 10, weight: "semibold" }), foregroundStyle(urgencyInk(item.tone, dark)), lineLimit(1)]}>
        {item.deadline}
      </Text>
    </VStack>
  );
}

/** Large: ranked list of the user's top matches, every row a tap target. */
function SystemLarge(props: OpportunityWidgetProps & { dark: boolean }) {
  const p = palette(props.dark);
  const items = getWidgetItems(props);

  return (
    <VStack
      alignment="leading"
      spacing={12}
      modifiers={[
        padding({ all: 16 }),
        background(p.bg),
        widgetURL(getWidgetLink(props, items[0])),
      ]}
    >
      <HStack spacing={8}>
        <LogoMark uri={props.logoUri} size={22} color={p.accent} />
        <Text modifiers={[font({ size: 15, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
          Top matches for you
        </Text>
        <Spacer />
      </HStack>
      <ListRow item={items[0]} dark={props.dark} />
      {items[1] ? <ListRow item={items[1]} dark={props.dark} /> : null}
      {items[2] ? <ListRow item={items[2]} dark={props.dark} /> : null}
      {items[3] ? <ListRow item={items[3]} dark={props.dark} /> : null}
      {items[4] ? <ListRow item={items[4]} dark={props.dark} /> : null}
      {items[5] ? <ListRow item={items[5]} dark={props.dark} /> : null}
      <Spacer />
    </VStack>
  );
}

function ListRow({ item, dark }: { item: OpportunityWidgetItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <HStack alignment="center" spacing={10} modifiers={[widgetURL(item.deepLink || "edutu://opportunities")]}>
      <Image
        systemName="sparkles"
        size={14}
        color={p.accent}
        modifiers={[frame({ width: 18 })]}
      />
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 14, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(1), truncationMode("tail")]}>
          {item.title}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}>
          {item.match ? `${item.match}% match · ${item.provider}` : item.provider}
        </Text>
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(urgencyInk(item.tone, dark)), lineLimit(1)]}>
        {item.deadline}
      </Text>
    </HStack>
  );
}

function OpportunityWidgetLayout(props: OpportunityWidgetProps, environment: WidgetEnvironment) {
  "widget";

  const opportunity = { ...DEFAULT_OPPORTUNITY, ...props };
  const dark = environment.colorScheme === "dark";

  if (environment.widgetFamily.startsWith("accessory")) {
    return AccessoryLayout(opportunity, environment);
  }

  if (environment.widgetFamily === "systemSmall") {
    return <SystemSmall {...opportunity} dark={dark} />;
  }

  if (environment.widgetFamily === "systemMedium") {
    return <SystemMedium {...opportunity} dark={dark} />;
  }

  return <SystemLarge {...opportunity} dark={dark} />;
}

const OpportunityWidget = createWidget<OpportunityWidgetProps>(
  "OpportunityWidget",
  OpportunityWidgetLayout
);

OpportunityWidget.updateSnapshot(DEFAULT_OPPORTUNITY);

export function updateOpportunityWidget(props: OpportunityWidgetProps) {
  OpportunityWidget.updateSnapshot({ ...DEFAULT_OPPORTUNITY, ...props });
}

/**
 * Schedule dated entries so WidgetKit re-renders countdowns on-device at each
 * midnight (no network, no background task needed between syncs).
 */
export function updateOpportunityWidgetTimeline(
  entries: Array<{ date: Date; props: OpportunityWidgetProps }>,
) {
  if (!entries.length) return;
  OpportunityWidget.updateTimeline(
    entries.map((entry) => ({
      date: entry.date,
      props: { ...DEFAULT_OPPORTUNITY, ...entry.props },
    })),
  );
}

export default OpportunityWidget;
