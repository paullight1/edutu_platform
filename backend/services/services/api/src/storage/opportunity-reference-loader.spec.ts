import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOpportunityReferences } from "./opportunity-reference-loader";

type ReferenceRow = {
  id: string;
  image_url: string;
  metadata: Record<string, unknown>;
};

function makeMutableClient(initialRows: ReferenceRow[]) {
  const rows = [...initialRows];
  let completedPages = 0;

  const client = {
    from(table: string) {
      if (table !== "opportunities") {
        throw new Error(`Unexpected table: ${table}`);
      }

      let afterId: string | undefined;
      let pageSize = 1000;
      let offset = 0;
      let orderedById = false;
      const query = {
        select() {
          return query;
        },
        gt(column: string, value: string) {
          if (column !== "id") throw new Error(`Unexpected cursor: ${column}`);
          afterId = value;
          return query;
        },
        order(column: string, options: { ascending: boolean }) {
          orderedById = column === "id" && options.ascending;
          return query;
        },
        limit(value: number) {
          pageSize = value;
          return query;
        },
        range(from: number, to: number) {
          offset = from;
          pageSize = to - from + 1;
          return query;
        },
        then<TResult1 = unknown, TResult2 = never>(
          onfulfilled?:
            | ((value: unknown) => TResult1 | PromiseLike<TResult1>)
            | null,
          onrejected?:
            | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
            | null,
        ) {
          if (!orderedById) {
            return Promise.reject(
              new Error("Reference pages must be ordered by id"),
            ).then(onfulfilled, onrejected);
          }

          const page = rows
            .filter((row) => afterId === undefined || row.id > afterId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .slice(offset, offset + pageSize);

          completedPages += 1;
          if (completedPages === 1) {
            rows.push({
              id: "0000-concurrent",
              image_url: "concurrent.jpg",
              metadata: {},
            });
          }

          return Promise.resolve({ data: page, error: null }).then(
            onfulfilled,
            onrejected,
          );
        },
      };

      return query;
    },
  };

  return client as unknown as SupabaseClient;
}

describe("loadOpportunityReferences", () => {
  it("does not skip existing references when rows are inserted across a 1,000-row boundary", async () => {
    const originalRows = Array.from({ length: 1001 }, (_, index) => ({
      id: `${String(index + 1).padStart(4, "0")}-original`,
      image_url: `image-${index + 1}.jpg`,
      metadata: { ordinal: index + 1 },
    }));

    const result = await loadOpportunityReferences(
      makeMutableClient(originalRows),
    );

    expect(result).toHaveLength(1001);
    expect(result.map((row) => row.id)).toEqual(
      originalRows.map((row) => row.id),
    );
  });
});
