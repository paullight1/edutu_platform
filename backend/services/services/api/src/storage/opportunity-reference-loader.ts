import type { SupabaseClient } from "@supabase/supabase-js";

export type OpportunityReferenceRow = {
  id: string;
  image_url: string | null;
  metadata: unknown;
};

export async function loadOpportunityReferences(
  client: SupabaseClient,
): Promise<OpportunityReferenceRow[]> {
  const records: OpportunityReferenceRow[] = [];
  const pageSize = 1000;
  let afterId: string | undefined;

  for (;;) {
    let query = client.from("opportunities").select("id,image_url,metadata");
    if (afterId) query = query.gt("id", afterId);

    const { data, error } = await query
      .order("id", { ascending: true })
      .limit(pageSize);
    if (error) throw error;

    const page = (data ?? []) as OpportunityReferenceRow[];
    records.push(...page);
    if (page.length < pageSize) break;

    const nextCursor = page.at(-1)?.id;
    if (!nextCursor || nextCursor === afterId) {
      throw new Error("Opportunity reference pagination did not advance");
    }
    afterId = nextCursor;
  }
  return records;
}
