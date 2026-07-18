import { UploadsService } from "./uploads.service";

/** Minimal Supabase-shaped mock: one uploads row + a storage blob. */
function makeClient(opts: {
  uploadRow: Record<string, unknown> | null;
  blobText?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
}) {
  return {
    from: (table: string) => {
      if (table !== "user_uploads")
        throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: opts.uploadRow, error: null }),
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => {
          opts.onUpdate(patch);
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    },
    storage: {
      from: () => ({
        download: () =>
          Promise.resolve({
            data:
              opts.blobText !== undefined
                ? {
                    arrayBuffer: async () =>
                      new TextEncoder().encode(opts.blobText).buffer,
                  }
                : null,
            error: opts.blobText !== undefined ? null : { message: "missing" },
          }),
      }),
    },
  } as never;
}

describe("UploadsService.ingest", () => {
  it("extracts text and marks the upload done", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = makeClient({
      uploadRow: { storage_path: "u/1.txt", mime_type: "text/plain" },
      blobText: "my real CV text",
      onUpdate: (patch) => patches.push(patch),
    });
    const service = new UploadsService(client);

    const result = await service.ingest("user_1", "up_1");

    expect(result.parseStatus).toBe("done");
    expect(result.chars).toBe("my real CV text".length);
    expect(patches[0]).toMatchObject({
      parse_status: "done",
      extracted_text: "my real CV text",
    });
  });

  it("marks the upload failed when the object is missing from storage", async () => {
    const patches: Array<Record<string, unknown>> = [];
    const client = makeClient({
      uploadRow: { storage_path: "u/1.txt", mime_type: "text/plain" },
      // no blobText → download returns an error
      onUpdate: (patch) => patches.push(patch),
    });
    const service = new UploadsService(client);

    const result = await service.ingest("user_1", "up_1");

    expect(result.parseStatus).toBe("failed");
    expect(patches[0]).toMatchObject({ parse_status: "failed" });
  });
});
