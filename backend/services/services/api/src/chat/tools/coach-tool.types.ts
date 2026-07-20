import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Device-side effect the mobile client executes after the turn (server code
 * cannot touch the phone's calendar or local notification scheduler).
 */
export interface DeviceAction {
  type: "calendar.sync" | "notifications.schedule";
  payload: Record<string, unknown>;
}

/** One-tap follow-up rendered under the assistant message. */
export interface ActionButton {
  id: string;
  kind:
    | "view_opportunity"
    | "create_roadmap"
    | "create_goals"
    | "spin_again"
    | "open_route";
  label: string;
  payload: Record<string, unknown>;
}

/** Document reference rendered as a card under the reply (P3 documents studio). */
export interface DocumentCard {
  docId: string;
  type: "cv" | "sop" | "cover_letter" | "essay";
  title: string;
  version: number;
  /** Set when an export just happened — a tappable signed URL. */
  url?: string;
  format?: "pdf" | "docx";
  fileName?: string;
}

/** Shareable opportunity image (the branded share card) shown inline in chat. */
export interface ImageCard {
  opportunityId: string;
  title: string;
  url: string;
  format: "png" | "svg";
}

/**
 * Per-turn context handed to every tool. The collect* sinks accumulate what
 * the reply will carry (cards, buttons, device effects) so tools stay pure
 * "do the thing, report JSON" functions.
 */
export interface CoachToolContext {
  userId: string;
  supabase: SupabaseClient;
  /**
   * Id of the chat turn that invoked this tool. Stamped on the metadata of any
   * LLM call a tool makes so every row of one turn can be joined in
   * ai_usage_logs when diagnosing a bad answer.
   */
  turnId?: string;
  collectOpportunities(rows: Array<Record<string, any>>): void;
  collectDeviceActions(actions: DeviceAction[]): void;
  collectActionButtons(buttons: ActionButton[]): void;
  collectDocuments(documents: DocumentCard[]): void;
  collectImages(images: ImageCard[]): void;
}

export interface CoachTool<Args = any> {
  name: string;
  description: string;
  /** Hand-written JSON Schema shown to the model. */
  parameters: Record<string, unknown>;
  /** Zod schema that actually validates the model's arguments. */
  schema: z.ZodType<Args>;
  execute(ctx: CoachToolContext, args: Args): Promise<unknown>;
}
