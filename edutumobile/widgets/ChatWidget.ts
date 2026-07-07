export type ChatWidgetProps = {
  /** Rotating placeholder shown in the faux input, e.g. "Ask me anything…". */
  prompt?: string;
  logoUri?: string;
};

export function updateChatWidget(_props: ChatWidgetProps) {
  return;
}

const ChatWidget = {
  updateSnapshot: updateChatWidget,
};

export default ChatWidget;
