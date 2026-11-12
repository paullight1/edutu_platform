import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  cornerRadius,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { ChatWidgetProps } from "./ChatWidget";

const DEFAULT_PROPS: ChatWidgetProps = {
  prompt: "Ask me anything…",
};

const CHAT_LINK = "edutu://chat";

function palette(dark: boolean) {
  return dark
    ? {
        bg: "#171A4F",
        bgInset: "#232866",
        sub: "#C3CBEE",
        accent: "#9DB4FF",
      }
    : {
        bg: "#FFFFFF",
        bgInset: "#EEF2FF",
        sub: "#475467",
        accent: "#3563E9",
      };
}

/**
 * One-tap launcher into Edutu's AI chat: the logo mark front and center, a
 * faux input pill below it. No wordmark — the logo is the brand.
 */
function ChatWidgetLayout(props: ChatWidgetProps, environment: WidgetEnvironment) {
  "widget";

  const merged = { ...DEFAULT_PROPS, ...props };
  const dark = environment.colorScheme === "dark";
  const p = palette(dark);

  if (environment.widgetFamily === "accessoryCircular") {
    return (
      <ZStack modifiers={[widgetURL(CHAT_LINK)]}>
        <AccessoryWidgetBackground />
        <Image systemName="bubble.left.and.text.bubble.right.fill" size={18} />
      </ZStack>
    );
  }

  const medium = environment.widgetFamily === "systemMedium";
  const mascot = merged.mascotUri ? <Image uiImage={merged.mascotUri} modifiers={[frame({ width: medium ? 106 : 64, height: medium ? 112 : 64 })]} />
    : <Image systemName="sparkles" size={44} color={p.accent} />;
  const content = <VStack alignment={medium ? "leading" : "center"} spacing={5} modifiers={[frame({ maxWidth: 2000 })]}>
    {medium ? <Text modifiers={[font({ size: 9, weight: "bold" }), foregroundStyle(p.accent), lineLimit(1)]}>YOUR OPPORTUNITY COACH</Text> : mascot}
    <Text modifiers={[font({ size: medium ? 18 : 15, weight: "bold" }), foregroundStyle(dark ? "#FFFFFF" : "#101828"), lineLimit(1)]}>Ask Edutu AI</Text>
    {medium ? <Text modifiers={[font({ size: 11 }), foregroundStyle(p.sub), lineLimit(2)]}>{merged.prompt || "What should I focus on next?"}</Text> : null}
    <Spacer />
    <HStack modifiers={[frame({ maxWidth: 2000, minHeight: 40 }), background(p.bgInset), cornerRadius(12)]}>
      <Spacer /><Text modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(p.accent), lineLimit(1)]}>Ask Edutu →</Text><Spacer />
    </HStack>
  </VStack>;
  return <HStack spacing={8} modifiers={[padding({ all: 12 }), background(p.bg), widgetURL(CHAT_LINK)]}>
    {content}
    {medium ? mascot : null}
  </HStack>;

}

const ChatWidget = createWidget<ChatWidgetProps>("ChatWidget", ChatWidgetLayout);

ChatWidget.updateSnapshot(DEFAULT_PROPS);

export function updateChatWidget(props: ChatWidgetProps) {
  ChatWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export default ChatWidget;
