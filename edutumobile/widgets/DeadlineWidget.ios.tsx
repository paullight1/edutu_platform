import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
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

import type { DeadlineWidgetItem, DeadlineWidgetProps } from "./DeadlineWidget";

const DEFAULT_PROPS: DeadlineWidgetProps = {
  items: [],
  emptyText: "No deadlines yet",
};

const DEADLINES_LINK = "edutu://deadlines";

function palette(dark: boolean) {
  return dark
    ? {
        bg: "#171A4F",
        bgInset: "#232866",
        ink: "#FFFFFF",
        sub: "#C3CBEE",
        faint: "#8A90C0",
        accent: "#9DB4FF",
      }
    : {
        bg: "#FFFFFF",
        bgInset: "#EEF2FF",
        ink: "#101828",
        sub: "#475467",
        faint: "#667085",
        accent: "#3563E9",
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
  return <Image systemName="calendar" size={size - 2} color={color} />;
}

/** The calendar block on the left of each agenda row: month over day. */
function DateRail({ item, dark }: { item: DeadlineWidgetItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="center"
      spacing={0}
      modifiers={[
        padding({ horizontal: 6, vertical: 5 }),
        background(p.bgInset),
        cornerRadius(10),
        frame({ width: 40 }),
      ]}
    >
      <Text modifiers={[font({ size: 9, weight: "semibold" }), foregroundStyle(p.faint), lineLimit(1)]}>
        {item.dateMonth || "—"}
      </Text>
      <Text modifiers={[font({ size: 16, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
        {item.dateDay || "?"}
      </Text>
    </VStack>
  );
}

function AgendaRow({ item, dark }: { item: DeadlineWidgetItem; dark: boolean }) {
  const p = palette(dark);
  return (
    <HStack alignment="center" spacing={10} modifiers={[widgetURL(item.deepLink || DEADLINES_LINK)]}>
      <DateRail item={item} dark={dark} />
      <VStack alignment="leading" spacing={2}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(1), truncationMode("tail")]}>
          {item.title}
        </Text>
        <Text modifiers={[font({ size: 10 }), foregroundStyle(p.sub), lineLimit(1), truncationMode("tail")]}>
          {item.kind === "applied" ? `Applied · ${item.organization}` : `Saved · ${item.organization}`}
        </Text>
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(urgencyInk(item.tone, dark)), lineLimit(1)]}>
        {item.deadline}
      </Text>
    </HStack>
  );
}

function EmptyState({ props, dark }: { props: DeadlineWidgetProps; dark: boolean }) {
  const p = palette(dark);
  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL("edutu://opportunities")]}
    >
      <LogoMark uri={props.logoUri} size={20} color={p.accent} />
      <Spacer />
      <Text modifiers={[font({ size: 14, weight: "bold" }), foregroundStyle(p.ink), lineLimit(2)]}>
        {props.emptyText || "No deadlines yet"}
      </Text>
      <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(2)]}>
        Save or apply to opportunities to track them here.
      </Text>
    </VStack>
  );
}

/** Small: the single nearest deadline as a big countdown. */
function SystemSmall(props: DeadlineWidgetProps & { dark: boolean }) {
  const p = palette(props.dark);
  const hero = props.items[0];
  if (!hero) return <EmptyState props={props} dark={props.dark} />;

  const days = hero.daysLeft;
  const showBigNumber = typeof days === "number" && days >= 0;

  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[
        padding({ all: 14 }),
        background(p.bg),
        widgetURL(hero.deepLink || DEADLINES_LINK),
      ]}
    >
      <HStack spacing={6}>
        <LogoMark uri={props.logoUri} size={20} color={p.accent} />
        <Spacer />
        <Text modifiers={[font({ size: 10, weight: "semibold" }), foregroundStyle(p.faint), lineLimit(1)]}>
          Next deadline
        </Text>
      </HStack>
      <Spacer />
      {showBigNumber ? (
        <HStack alignment="lastTextBaseline" spacing={4}>
          <Text modifiers={[font({ size: 34, weight: "bold" }), foregroundStyle(urgencyInk(hero.tone, props.dark)), lineLimit(1)]}>
            {`${days}`}
          </Text>
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(p.sub), lineLimit(1)]}>
            {days === 1 ? "day left" : "days left"}
          </Text>
        </HStack>
      ) : (
        <Text modifiers={[font({ size: 16, weight: "bold" }), foregroundStyle(urgencyInk(hero.tone, props.dark)), lineLimit(1)]}>
          {hero.deadline}
        </Text>
      )}
      <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(p.ink), lineLimit(2), truncationMode("tail")]}>
        {hero.title}
      </Text>
    </VStack>
  );
}

/** Medium/large: calendar-style agenda, one row per deadline. */
function Agenda(props: DeadlineWidgetProps & { dark: boolean; maxRows: number }) {
  const p = palette(props.dark);
  if (!props.items.length) return <EmptyState props={props} dark={props.dark} />;

  const first = props.items[0];
  const second = props.items[1];
  const third = props.items[2];
  const fourth = props.items[3];
  const fifth = props.items[4];
  const sixth = props.items[5];

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(DEADLINES_LINK)]}
    >
      <HStack spacing={8}>
        <LogoMark uri={props.logoUri} size={18} color={p.accent} />
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(p.ink), lineLimit(1)]}>
          Deadlines
        </Text>
        <Spacer />
      </HStack>
      <AgendaRow item={first} dark={props.dark} />
      {second ? <AgendaRow item={second} dark={props.dark} /> : null}
      {props.maxRows > 2 && third ? <AgendaRow item={third} dark={props.dark} /> : null}
      {props.maxRows > 3 && fourth ? <AgendaRow item={fourth} dark={props.dark} /> : null}
      {props.maxRows > 4 && fifth ? <AgendaRow item={fifth} dark={props.dark} /> : null}
      {props.maxRows > 5 && sixth ? <AgendaRow item={sixth} dark={props.dark} /> : null}
      <Spacer />
    </VStack>
  );
}

function DeadlineWidgetLayout(props: DeadlineWidgetProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";

  if (environment.widgetFamily === "accessoryRectangular") {
    const hero = merged.items[0];
    return (
      <ZStack modifiers={[widgetURL(hero?.deepLink || DEADLINES_LINK)]}>
        <AccessoryWidgetBackground />
        <VStack alignment="leading" spacing={2} modifiers={[padding({ horizontal: 8, vertical: 4 })]}>
          <Text modifiers={[font({ size: 12, weight: "bold" }), lineLimit(2), truncationMode("tail")]}>
            {hero ? hero.title : "No deadlines yet"}
          </Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle({ type: "hierarchical", style: "secondary" }), lineLimit(1)]}>
            {hero ? hero.deadline : "Save opportunities"}
          </Text>
        </VStack>
      </ZStack>
    );
  }

  if (environment.widgetFamily === "systemSmall") {
    return <SystemSmall {...merged} dark={dark} />;
  }

  if (environment.widgetFamily === "systemMedium") {
    return <Agenda {...merged} dark={dark} maxRows={3} />;
  }

  return <Agenda {...merged} dark={dark} maxRows={6} />;
}

const DeadlineWidget = createWidget<DeadlineWidgetProps>("DeadlineWidget", DeadlineWidgetLayout);

DeadlineWidget.updateSnapshot(DEFAULT_PROPS);

export function updateDeadlineWidget(props: DeadlineWidgetProps) {
  DeadlineWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export function updateDeadlineWidgetTimeline(
  entries: Array<{ date: Date; props: DeadlineWidgetProps }>,
) {
  if (!entries.length) return;
  DeadlineWidget.updateTimeline(
    entries.map((entry) => ({
      date: entry.date,
      props: { ...DEFAULT_PROPS, ...entry.props },
    })),
  );
}

export default DeadlineWidget;
