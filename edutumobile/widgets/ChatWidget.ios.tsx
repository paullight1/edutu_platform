import { AccessoryWidgetBackground, HStack, Image, Spacer, Text, VStack, ZStack } from "@expo/ui/swift-ui";
import {
  background,
  clipShape,
  font,
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

  return (
    <VStack
      alignment="center"
      spacing={0}
      modifiers={[padding({ all: 14 }), background(p.bg), widgetURL(CHAT_LINK)]}
    >
      <Spacer />
      {merged.logoUri ? (
        <Image uiImage={merged.logoUri} modifiers={[frame({ width: 46, height: 46 })]} />
      ) : (
        <Image systemName="sparkles" size={38} color={p.accent} />
      )}
      <Spacer />
      <HStack
        spacing={6}
        modifiers={[
          padding({ horizontal: 12, vertical: 8 }),
          background(p.bgInset),
          clipShape("capsule"),
        ]}
      >
        <Image systemName="sparkles" size={11} color={p.accent} />
        <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(p.sub), lineLimit(1)]}>
          {merged.prompt || "Ask me anything…"}
        </Text>
      </HStack>
    </VStack>
  );
}

const ChatWidget = createWidget<ChatWidgetProps>("ChatWidget", ChatWidgetLayout);

ChatWidget.updateSnapshot(DEFAULT_PROPS);

export function updateChatWidget(props: ChatWidgetProps) {
  ChatWidget.updateSnapshot({ ...DEFAULT_PROPS, ...props });
}

export default ChatWidget;
