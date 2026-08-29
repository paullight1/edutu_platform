import { build } from "vite";
import { describe, expect, it } from "vitest";
import {
  AdminRuntimeConfigError,
  resolveAdminRuntimeConfig,
} from "./runtimeConfig";

describe("getAdminRuntimeConfig", () => {
  it("reads the backend origin from the compiled browser module", async () => {
    const result = await build({
      configFile: false,
      logLevel: "silent",
      define: {
        "import.meta.env": JSON.stringify({
          VITE_BACKEND_URL: "http://localhost:3010/",
          PROD: false,
          MODE: "test",
        }),
      },
      build: {
        write: false,
        minify: false,
        lib: {
          entry: new URL("./runtimeConfig.ts", import.meta.url).pathname,
          formats: ["es"],
          fileName: "runtime-config",
        },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    const chunk = output.output.find((item) => item.type === "chunk");
    if (!chunk) throw new Error("Vite did not emit the runtime config module");

    const moduleUrl = `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`;
    const runtime = (await import(moduleUrl)) as {
      getAdminRuntimeConfig: () => { apiOrigin: string; source: string; explicit: boolean };
    };

    expect(runtime.getAdminRuntimeConfig()).toMatchObject({
      apiOrigin: "http://localhost:3010",
      source: "VITE_BACKEND_URL",
      explicit: true,
    });
  });
});

describe("resolveAdminRuntimeConfig", () => {
  it("uses the explicit canonical production origin", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "https://edutu-api.onrender.com/" },
        "production",
      ),
    ).toEqual({
      apiOrigin: "https://edutu-api.onrender.com",
      source: "VITE_BACKEND_URL",
      explicit: true,
      mode: "production",
    });
  });

  it("accepts VITE_API_URL only as a marked compatibility alias", () => {
    expect(
      resolveAdminRuntimeConfig(
        { VITE_API_URL: "https://legacy-api.example.com" },
        "production",
      ),
    ).toMatchObject({
      apiOrigin: "https://legacy-api.example.com",
      source: "VITE_API_URL",
      explicit: true,
      legacyAlias: true,
    });
  });

  it("uses the development proxy only outside production", () => {
    expect(resolveAdminRuntimeConfig({}, "development")).toMatchObject({
      apiOrigin: "",
      source: "development-proxy",
      explicit: false,
      mode: "development",
    });
  });

  it("fails closed when production has no explicit API origin", () => {
    expect(() => resolveAdminRuntimeConfig({}, "production")).toThrow(
      AdminRuntimeConfigError,
    );
  });

  it("rejects insecure production origins", () => {
    expect(() =>
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "http://api.example.com" },
        "production",
      ),
    ).toThrow(/https/i);
  });

  it("rejects credentials embedded in the production origin", () => {
    expect(() =>
      resolveAdminRuntimeConfig(
        { VITE_BACKEND_URL: "https://user:password@api.example.com" },
        "production",
      ),
    ).toThrow(/credentials/i);
  });
});
