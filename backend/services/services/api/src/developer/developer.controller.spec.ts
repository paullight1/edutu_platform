import { DeveloperController } from "./developer.controller";

describe("DeveloperController", () => {
  it("keeps Clerk identity on lifecycle mutations and does not pass email ownership", async () => {
    const service = {
      rotateProject: jest.fn().mockResolvedValue({ rawKey: "secret" }),
      revokeProject: jest.fn().mockResolvedValue({ status: "revoked" }),
    };
    const controller = new DeveloperController(service as any);

    await controller.rotateProject("clerk-user-b", "project-a");
    await controller.revokeProject("clerk-user-b", "project-a");

    expect(service.rotateProject).toHaveBeenCalledWith(
      "clerk-user-b",
      "project-a",
    );
    expect(service.revokeProject).toHaveBeenCalledWith(
      "clerk-user-b",
      "project-a",
    );
  });
});
