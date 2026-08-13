import { IsIn, IsString, Matches, MaxLength } from "class-validator";

export const BILLING_RETURN_SURFACES = ["web", "pwa", "mobile_web"] as const;
export type BillingReturnSurface = (typeof BILLING_RETURN_SURFACES)[number];

export class CreateBachsCheckoutDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9_]*$/)
  productKey!: string;

  @IsIn(BILLING_RETURN_SURFACES)
  returnSurface!: BillingReturnSurface;
}
