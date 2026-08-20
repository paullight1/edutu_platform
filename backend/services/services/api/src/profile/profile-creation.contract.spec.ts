import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("profile creation credit contract", () => {
  it("keeps trusted server-side profile creation explicit at zero credits", () => {
    const clerkWebhook = source("src/auth/clerk-webhook.controller.ts");
    const profileService = source("src/profile/profile.service.ts");

    for (const trustedPath of [clerkWebhook, profileService]) {
      expect(trustedPath).toMatch(/credits:\s*0/);
      expect(trustedPath).toMatch(/ignoreDuplicates:\s*true/);
    }
  });

  it("keeps browser self-service profile writes credit-free", () => {
    const webAuth = source("../../../../edutu-web-app/src/lib/auth.ts");

    const insertColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_INSERT_COLUMNS = \[([\s\S]*?)\] as const;/,
    );
    const updateColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_UPDATE_COLUMNS = \[([\s\S]*?)\] as const;/,
    );

    expect(insertColumns).not.toBeNull();
    expect(updateColumns).not.toBeNull();
    expect(insertColumns?.[1]).not.toMatch(/["']credits["']/);
    expect(updateColumns?.[1]).not.toMatch(/["']credits["']/);
    expect(webAuth).toMatch(/buildSelfServiceProfileInsert\(profile\)/);
    expect(webAuth).toMatch(/buildSelfServiceProfileUpdate\(profile\)/);
  });

  it("covers mobile and web profile bootstraps without resetting balances", () => {
    const mobileWebhook = source(
      "../../../../edutumobile/supabase/functions/clerk-webhook/index.ts",
    );
    const mobileEdit = source(
      "../../../../edutumobile/app/(app)/profile/edit.tsx",
    );
    const webAuth = source("../../../../edutu-web-app/src/lib/auth.ts");

    for (const profilePath of [mobileWebhook, mobileEdit, webAuth]) {
      expect(profilePath).toMatch(/credits:\s*0/);
      expect(profilePath).toMatch(/ignoreDuplicates:\s*true/);
      expect(profilePath).toMatch(/\.update\(/);
    }
  });

  it("keeps trusted bootstrap explicit while client profile writes stay credit-free", () => {
    const mobileWebhook = source(
      "../../../../edutumobile/supabase/functions/clerk-webhook/index.ts",
    );
    const mobileEdit = source(
      "../../../../edutumobile/app/(app)/profile/edit.tsx",
    );
    const webAuth = source("../../../../edutu-web-app/src/lib/auth.ts");

    expect(mobileWebhook).toMatch(
      /credits:\s*0[\s\S]*?ignoreDuplicates:\s*true/,
    );

    const mobileUpsert = mobileEdit.match(
      /\.upsert\(\s*\{([\s\S]*?)\}\s*,\s*\{\s*onConflict:\s*['"]user_id['"]\s*\}\s*,?\s*\)/,
    );
    expect(mobileUpsert).not.toBeNull();
    expect(mobileUpsert?.[1]).not.toMatch(/\bcredits\s*:/);

    const insertColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_INSERT_COLUMNS = \[([\s\S]*?)\] as const;/,
    );
    const updateColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_UPDATE_COLUMNS = \[([\s\S]*?)\] as const;/,
    );
    expect(insertColumns).not.toBeNull();
    expect(updateColumns).not.toBeNull();
    expect(insertColumns?.[1]).not.toMatch(/["']credits["']/);
    expect(updateColumns?.[1]).not.toMatch(/["']credits["']/);
    expect(webAuth).toMatch(/buildSelfServiceProfileInsert\(profile\)/);
    expect(webAuth).toMatch(/buildSelfServiceProfileUpdate\(profile\)/);
  });

  it("makes the mobile auth trigger and seed rows explicit zero-credit paths", () => {
    const mobileAuth = source(
      "../../../../edutumobile/supabase/migrations/20260817000100_create_profile_on_auth_user.sql",
    );
    const mobileSchema = source(
      "../../../../edutumobile/supabase/migrations/20250817000000_initial_schema.sql",
    );

    expect(mobileAuth).toMatch(/insert into public\.profiles\s*\(user_id,\s*credits\)/i);
    expect(mobileAuth).toMatch(/values\s*\(new\.id::text,\s*0\)/i);
    expect(mobileSchema).toMatch(/insert into public\.profiles\s*\(user_id,\s*credits\)/i);
    expect(mobileSchema).toMatch(/values\s*\(new\.id::text,\s*0\)/i);
  });
});
