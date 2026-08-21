import { NotFoundException } from "@nestjs/common";
import { ApplicationHistoryService } from "./application-history.service";

function createQuery(result: unknown) {
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    insert: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve(result)),
  };
  return query;
}

describe("ApplicationHistoryService", () => {
  it("refuses to expose history when the application is not owned by the caller", async () => {
    const service = new ApplicationHistoryService();
    const ownership = createQuery({ data: null, error: null });
    Object.defineProperty(service, "supabase", {
      value: { from: jest.fn(() => ownership) },
    });

    await expect(
      service.list("user_12345678", "11111111-1111-4111-8111-111111111111"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("scopes timeline queries to both application and caller database user id", async () => {
    const service = new ApplicationHistoryService();
    const ownership = createQuery({
      data: { id: "app-1", status: "submitted", user_id: "user_12345678" },
      error: null,
    });
    const history = createQuery({ data: [], error: null });
    const from = jest
      .fn()
      .mockReturnValueOnce(ownership)
      .mockReturnValueOnce(history);
    Object.defineProperty(service, "supabase", { value: { from } });

    await service.list("user_12345678", "11111111-1111-4111-8111-111111111111");

    expect(from).toHaveBeenNthCalledWith(1, "opportunity_applications");
    expect(from).toHaveBeenNthCalledWith(2, "application_history");
    expect(history.eq).toHaveBeenCalledWith(
      "application_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(history.eq).toHaveBeenCalledWith(
      "user_id",
      "5f6199f7-4ed4-463b-a49c-3d1d6cd7aa07",
    );
  });
});
