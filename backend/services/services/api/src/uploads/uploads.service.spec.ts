import { Test } from "@nestjs/testing";
import { UploadsService } from "./uploads.service";
import { UploadsModule } from "./uploads.module";

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({})),
}));

describe("UploadsModule", () => {
  it("compiles without an explicit supabase client provider", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UploadsModule],
    }).compile();

    expect(moduleRef.get(UploadsService)).toBeInstanceOf(UploadsService);
  });
});

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

/** Mock for the download-url path: select row + storage.createSignedUrl. */
function makeDownloadClient(opts: {
  uploadRow: Record<string, unknown> | null;
  signedUrl?: string;
}) {
  const createSignedUrl = jest.fn(() =>
    Promise.resolve(
      opts.signedUrl
        ? { data: { signedUrl: opts.signedUrl }, error: null }
        : { data: null, error: { message: "sign failed" } },
    ),
  );
  return {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: opts.uploadRow, error: null }),
            }),
          }),
        }),
      }),
      storage: { from: () => ({ createSignedUrl }) },
    } as never,
    createSignedUrl,
  };
}

describe("UploadsService.getDownloadUrl", () => {
  it("returns a signed URL with the original file name", async () => {
    const { client, createSignedUrl } = makeDownloadClient({
      uploadRow: {
        file_name: "My_CV.pdf",
        storage_path: "user_1/abc-My_CV.pdf",
        mime_type: "application/pdf",
      },
      signedUrl: "https://signed.example/abc",
    });
    const service = new UploadsService(client);

    const result = await service.getDownloadUrl("user_1", "up_1");

    expect(result).toEqual({
      url: "https://signed.example/abc",
      fileName: "My_CV.pdf",
      mimeType: "application/pdf",
      expiresIn: 300,
    });
    expect(createSignedUrl).toHaveBeenCalledWith("user_1/abc-My_CV.pdf", 300, {
      download: "My_CV.pdf",
    });
  });

  it("404s when the upload does not belong to the caller", async () => {
    const { client } = makeDownloadClient({ uploadRow: null });
    const service = new UploadsService(client);

    await expect(service.getDownloadUrl("user_2", "up_1")).rejects.toThrow(
      "Upload not found",
    );
  });
});

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
