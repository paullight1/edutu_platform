import type { ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { CommunityDmsController } from "./community-dms.controller";

const RAW_SUBJECT = "user_2abcRAWclerksub";
const DERIVED_UUID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

const HANDLERS: (keyof CommunityDmsController)[] = [
  "relationship",
  "listRequests",
  "createRequest",
  "acceptRequest",
  "declineRequest",
  "listConversations",
  "getConversation",
  "listMessages",
  "sendMessage",
  "markRead",
  "hideConversation",
  "listBlocks",
  "blockUser",
  "unblockUser",
];

function resolveCustomArgs(
  method: keyof CommunityDmsController,
  user: Record<string, string>,
): unknown[] {
  const metadata: Record<
    string,
    {
      data: unknown;
      factory?: (data: unknown, ctx: ExecutionContext) => unknown;
    }
  > =
    Reflect.getMetadata(ROUTE_ARGS_METADATA, CommunityDmsController, method) ??
    {};
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return Object.values(metadata)
    .filter((entry) => typeof entry.factory === "function")
    .map((entry) => entry.factory!(entry.data, context));
}

describe("CommunityDmsController identity", () => {
  it("authorizes every route with the raw Clerk subject", () => {
    const user = { id: DERIVED_UUID, authId: RAW_SUBJECT };
    for (const handler of HANDLERS) {
      expect({ handler, args: resolveCustomArgs(handler, user) }).toEqual({
        handler,
        args: [RAW_SUBJECT],
      });
    }
  });

  it("keeps the identity assertion in sync with every controller route", () => {
    const declared = Object.getOwnPropertyNames(
      CommunityDmsController.prototype,
    ).filter(
      (name) =>
        name !== "constructor" &&
        Reflect.getMetadata(ROUTE_ARGS_METADATA, CommunityDmsController, name),
    );
    expect(declared.sort()).toEqual([...HANDLERS].sort());
  });
});
