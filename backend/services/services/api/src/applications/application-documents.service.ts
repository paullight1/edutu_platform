import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Roles a competitive application is expected to carry before submission. */
export const REQUIRED_ROLES = ["cv", "sop"] as const;

export type DocRole = "cv" | "sop" | "transcript" | "other";
export type DocStatus = "missing" | "draft" | "submitted";

export type DocRow = {
  id: string;
  role: string;
  status: string;
  documentId: string | null;
  uploadId: string | null;
  submittedAt: string | null;
};

export type AppWithDocs = {
  applicationId: string;
  opportunityId: string;
  opportunityTitle: string;
  status: string;
  deadline: string | null;
  docs: DocRow[];
  missingRoles: string[];
};

/**
 * Which REQUIRED_ROLES have no attached document yet (a doc with any status
 * other than 'missing' counts as present). Pure so it is unit-testable without
 * a database.
 */
export function deriveMissingRoles(
  docs: Array<{ role: string; status: string }>,
): string[] {
  const present = new Set(
    docs.filter((doc) => doc.status !== "missing").map((doc) => doc.role),
  );
  return REQUIRED_ROLES.filter((role) => !present.has(role));
}

function mapDocRow(row: Record<string, unknown>): DocRow {
  return {
    id: String(row.id),
    role: String(row.role),
    status: String(row.status),
    documentId: (row.document_id as string | null) ?? null,
    uploadId: (row.upload_id as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
  };
}

@Injectable()
export class ApplicationDocumentsService {
  private readonly supabase: SupabaseClient;

  // clientOverride lets specs inject a mock; production builds the service-role
  // client from env exactly like ChatService does.
  constructor(clientOverride?: SupabaseClient) {
    this.supabase =
      clientOverride ??
      createClient(
        process.env.SUPABASE_URL as string,
        process.env.SUPABASE_SERVICE_ROLE_KEY as string,
        { auth: { persistSession: false } },
      );
  }

  /** All of the user's applications with per-application document completeness. */
  async listForUser(userId: string): Promise<AppWithDocs[]> {
    const { data: applications } = await this.supabase
      .from("opportunity_applications")
      .select(
        "id, status, opportunity:opportunities(id, title, close_date, deadline)",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    const apps = (applications ?? []) as Array<Record<string, any>>;
    if (!apps.length) return [];

    const { data: docsData } = await this.supabase
      .from("application_documents")
      .select(
        "id, application_id, role, status, document_id, upload_id, submitted_at",
      )
      .eq("user_id", userId);

    const docsByApp = new Map<string, DocRow[]>();
    for (const raw of (docsData ?? []) as Array<Record<string, unknown>>) {
      const key = String(raw.application_id);
      const list = docsByApp.get(key) ?? [];
      list.push(mapDocRow(raw));
      docsByApp.set(key, list);
    }

    return apps.map((app) => {
      const opportunity = (app.opportunity ?? {}) as Record<string, unknown>;
      const docs = docsByApp.get(String(app.id)) ?? [];
      return {
        applicationId: String(app.id),
        opportunityId: String(opportunity.id ?? ""),
        opportunityTitle: String(opportunity.title ?? "Opportunity"),
        status: String(app.status ?? "draft"),
        deadline:
          (opportunity.close_date as string | null) ??
          (opportunity.deadline as string | null) ??
          null,
        docs,
        missingRoles: deriveMissingRoles(docs),
      };
    });
  }

  async getStatus(
    userId: string,
    applicationId: string,
  ): Promise<AppWithDocs | null> {
    const all = await this.listForUser(userId);
    return all.find((app) => app.applicationId === applicationId) ?? null;
  }

  /** Attach an AI document or an upload to an application under a role. */
  async linkDocument(
    userId: string,
    input: {
      applicationId: string;
      role: DocRole;
      documentId?: string;
      uploadId?: string;
      status?: DocStatus;
    },
  ): Promise<DocRow> {
    const { data, error } = await this.supabase
      .from("application_documents")
      .insert({
        application_id: input.applicationId,
        user_id: userId,
        role: input.role,
        document_id: input.documentId ?? null,
        upload_id: input.uploadId ?? null,
        status: input.status ?? "draft",
      })
      .select(
        "id, application_id, role, status, document_id, upload_id, submitted_at",
      )
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to link document");
    }
    return mapDocRow(data as Record<string, unknown>);
  }

  /**
   * Mark a role's document submitted. Upserts the row (so marking a role that
   * was only 'missing' works), then flips the whole application to 'submitted'
   * once every REQUIRED_ROLE is submitted.
   */
  async markSubmitted(
    userId: string,
    input: { applicationId: string; role: DocRole },
  ): Promise<DocRow> {
    const nowIso = new Date().toISOString();
    const { data: existing } = await this.supabase
      .from("application_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("application_id", input.applicationId)
      .eq("role", input.role)
      .maybeSingle();

    let row: Record<string, unknown> | null = null;
    if (existing?.id) {
      const { data } = await this.supabase
        .from("application_documents")
        .update({ status: "submitted", submitted_at: nowIso })
        .eq("id", (existing as { id: string }).id)
        .select(
          "id, application_id, role, status, document_id, upload_id, submitted_at",
        )
        .single();
      row = data as Record<string, unknown>;
    } else {
      const { data } = await this.supabase
        .from("application_documents")
        .insert({
          application_id: input.applicationId,
          user_id: userId,
          role: input.role,
          status: "submitted",
          submitted_at: nowIso,
        })
        .select(
          "id, application_id, role, status, document_id, upload_id, submitted_at",
        )
        .single();
      row = data as Record<string, unknown>;
    }

    await this.maybeMarkApplicationSubmitted(userId, input.applicationId);
    if (!row) throw new Error("Failed to mark submitted");
    return mapDocRow(row);
  }

  private async maybeMarkApplicationSubmitted(
    userId: string,
    applicationId: string,
  ): Promise<void> {
    const status = await this.getStatus(userId, applicationId);
    if (status && status.missingRoles.length === 0) {
      await this.supabase
        .from("opportunity_applications")
        .update({ status: "submitted", submitted_at: new Date().toISOString() })
        .eq("id", applicationId)
        .eq("user_id", userId);
    }
  }
}
