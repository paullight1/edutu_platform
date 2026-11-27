import { ForbiddenException } from "@nestjs/common";
import { toDatabaseUserId } from "../common/user-id";
import { pool } from "../db";
import { AutoApplyAdminController } from "./auto-apply-admin.controller";

jest.mock("../db", () => ({ pool: { query: jest.fn() } }));
const query = jest.mocked(pool.query);

beforeEach(() => query.mockReset());

it("rejects a support agent before any quota query", async () => {
  await expect(
    new AutoApplyAdminController().setUserLimit(
      "support_agent",
      "user_learner",
      { monthlyLimit: 8 },
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(query).not.toHaveBeenCalled();
});

it("stores an admin's learner override under the canonical identity", async () => {
  query.mockResolvedValueOnce({ rowCount: 1 } as never);
  query.mockResolvedValueOnce({} as never);
  await expect(
    new AutoApplyAdminController().setUserLimit("admin", "user_learner", {
      monthlyLimit: 8,
    }),
  ).resolves.toEqual({ monthlyLimit: 8 });
  expect(query).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining("auto_apply_user_limits"),
    [toDatabaseUserId("user_learner"), 8],
  );
});
