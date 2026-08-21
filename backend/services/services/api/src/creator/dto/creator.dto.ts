import { z } from "zod";

const HttpUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Marketplace URLs must use http(s)." },
  );

// Canonical application payload — one schema for both kinds and every client.
// Which narrative fields are present depends on the surface (mobile creator
// wizard sends motivation/opportunity/KYC; the web form sends display/content/
// proof), so almost everything is optional and the refine enforces that the
// application says *something* about the applicant.
export const CreatorApplicationSchema = z
  .object({
    applicationKind: z.enum(["creator", "mentor"]).default("creator"),
    displayName: z.string().trim().min(1).max(120).optional(),
    bio: z.string().trim().min(1).max(4000).optional(),
    contentType: z.string().trim().min(1).max(80).optional(),
    experience: z.string().trim().max(2000).optional(),
    sampleContentUrl: z.string().url().optional().or(z.literal("")),
    motivation: z.string().trim().max(4000).optional(),
    opportunityType: z.string().trim().max(80).optional(),
    opportunityTitle: z.string().trim().max(200).optional(),
    linkedinUrl: z.string().trim().max(500).optional(),
    portfolioUrl: z.string().trim().max(500).optional(),
    socialLinks: z.string().trim().max(1000).optional(),
    // Storage path in the private creator-applications bucket (identity doc).
    kycImageUrl: z.string().trim().max(500).optional(),
    // Legacy URL field. New submissions persist only proofPath in the private
    // creator-proofs bucket and reviewers use short-lived signed URLs.
    proofUrl: z.string().url().optional().or(z.literal("")),
    proofPath: z.string().trim().max(500).optional(),
    proofFileName: z.string().trim().max(255).optional(),
    proofFileType: z.string().trim().max(120).optional(),
    proofFileSize: z.number().int().min(0).max(100_000_000).optional(),
    consentAccepted: z.boolean().optional(),
    email: z.string().trim().email().optional(),
    phoneNumber: z.string().trim().max(40).optional(),
    country: z.string().trim().max(120).optional(),
  })
  .refine((dto) => Boolean(dto.displayName || dto.bio || dto.motivation), {
    message: "Provide at least a display name, bio, or motivation.",
  });

export type CreatorApplicationDto = z.infer<typeof CreatorApplicationSchema>;

export const MarketplaceListingSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().min(1).max(80),
    type: z.enum(["free", "paid", "credit", "course"]).optional(),
    price: z.number().int().min(0).max(1_000_000).optional(),
    imageUrl: HttpUrlSchema.optional(),
    // Legacy DB/API name. This is a PROTECTED learner fulfillment link, not a
    // public preview: public catalogue queries deliberately mask it and only
    // the enrolled learner receives it through the authenticated enrollment
    // response/list.
    previewUrl: HttpUrlSchema.optional(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    eventDate: z.string().datetime().optional(),
    eventEndDate: z.string().datetime().optional(),
    eventLocation: z.string().trim().max(500).optional(),
    capacity: z.number().int().positive().max(100_000).optional(),
  })
  .superRefine((dto, ctx) => {
    const price = dto.price ?? 0;
    const effectiveType = dto.type ?? (price > 0 ? "paid" : "free");

    if (effectiveType === "free" && price > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Free listings cannot charge credits.",
      });
    }

    if (
      (effectiveType === "paid" || effectiveType === "credit") &&
      price <= 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Paid listings need a credit price greater than zero.",
      });
    }

    if (
      (price > 0 || effectiveType === "course") &&
      !dto.previewUrl
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["previewUrl"],
        message:
          "Paid and course listings need a learner access URL before they can be submitted.",
      });
    }
  });

export type MarketplaceListingDto = z.infer<typeof MarketplaceListingSchema>;

export const CreatorReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().trim().max(2000).optional(),
});

export type CreatorReviewDto = z.infer<typeof CreatorReviewSchema>;
