import type { CommunityMessage } from "./types";

const REPORT_EVENT = "edutu:community:report-message";
const BLOCK_EVENT = "edutu:community:block-author";

type CommunityMessageEvent = CustomEvent<{ message: CommunityMessage }>;

function dispatch(type: string, message: CommunityMessage) {
  window.dispatchEvent(
    new CustomEvent(type, {
      detail: { message },
    }),
  );
}

export function requestCommunityMessageReport(message: CommunityMessage) {
  dispatch(REPORT_EVENT, message);
}

export function requestCommunityAuthorBlock(message: CommunityMessage) {
  dispatch(BLOCK_EVENT, message);
}

export function subscribeCommunityMessageActions(handlers: {
  onReport: (message: CommunityMessage) => void;
  onBlock: (message: CommunityMessage) => void;
}) {
  const report = (event: Event) => {
    const message = (event as CommunityMessageEvent).detail?.message;
    if (message) handlers.onReport(message);
  };
  const block = (event: Event) => {
    const message = (event as CommunityMessageEvent).detail?.message;
    if (message) handlers.onBlock(message);
  };

  window.addEventListener(REPORT_EVENT, report);
  window.addEventListener(BLOCK_EVENT, block);
  return () => {
    window.removeEventListener(REPORT_EVENT, report);
    window.removeEventListener(BLOCK_EVENT, block);
  };
}
