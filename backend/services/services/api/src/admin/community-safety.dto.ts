import { z } from "zod";

export const CommunityReportStatusSchema = z.enum([
  "open",
  "reviewing",
  "resolved",
  "dismissed",
]);
export type CommunityReportStatus = z.infer<typeof CommunityReportStatusSchema>;

export const UpdateCommunityReportSchema = z.object({
  status: CommunityReportStatusSchema,
});
export type UpdateCommunityReportDto = z.infer<typeof UpdateCommunityReportSchema>;

export const EnforceCommunityReportSchema = z.object({
  action: z.enum(["remove_message", "archive_group"]),
});
export type EnforceCommunityReportDto = z.infer<typeof EnforceCommunityReportSchema>;

export interface AdminCommunityReport {
  id: string;
  targetType: "message" | "group";
  targetId: string;
  reporterId: string;
  reason: string;
  status: CommunityReportStatus;
  createdAt: string;
  group: {
    id: string;
    name: string;
    visibility: string;
    archivedAt: string | null;
  } | null;
  message: {
    id: string;
    userId: string;
    body: string;
    deletedAt: string | null;
  } | null;
}

export interface AdminCommunityReportsResponse {
  reports: AdminCommunityReport[];
  status: CommunityReportStatus | "all";
  generatedAt: string;
}
