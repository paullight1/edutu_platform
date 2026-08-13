import { validateSync } from "class-validator";
import {
  BILLING_RETURN_SURFACES,
  CreateBachsCheckoutDto,
} from "./create-checkout.dto";

describe("CreateBachsCheckoutDto", () => {
  function errorsFor(input: Partial<CreateBachsCheckoutDto>) {
    return validateSync(Object.assign(new CreateBachsCheckoutDto(), input));
  }

  it.each(BILLING_RETURN_SURFACES)(
    "accepts a server product key for the %s return surface",
    (returnSurface) => {
      expect(
        errorsFor({ productKey: "pro_monthly_card", returnSurface }),
      ).toHaveLength(0);
    },
  );

  it.each(["", "Pro_monthly", "pro-monthly", "_pro_monthly", "p".repeat(81)])(
    "rejects an unsafe product key: %p",
    (productKey) => {
      expect(errorsFor({ productKey, returnSurface: "web" })).not.toHaveLength(
        0,
      );
    },
  );

  it("rejects an unsupported return surface", () => {
    expect(
      errorsFor({
        productKey: "pro_monthly_card",
        returnSurface: "native" as never,
      }),
    ).not.toHaveLength(0);
  });
});
