import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiRoot = resolve(__dirname, "../..");

function source(relativePath: string) {
  return readFileSync(resolve(apiRoot, relativePath), "utf8");
}

describe("profile creation credit contract", () => {
  it("explicitly defaults every API profile creation path to zero credits", () => {
    for (const relativePath of [
      "src/auth/clerk-auth.guard.ts",
      "src/profile/profile.service.ts",
      "src/admin/admin.service.ts",
      "src/db/seed.ts",
    ]) {
      expect(source(relativePath)).toMatch(/creditsBalance:\s*0/);
    }

    expect(source("src/chat/chat.service.ts")).toMatch(
      /credits:\s*0[\s\S]*?ignoreDuplicates:\s*true/,
    );
    expect(
      source("../../../../edutumobile/supabase/functions/chat-proxy/index.ts"),
    ).toMatch(/credits:\s*0[\s\S]*?ignoreDuplicates:\s*true/);
  });

  it("keeps the Supabase auth trigger explicit and non-destructive on conflict", () => {
    const schema = source("supabase/schema.sql");

    expect(schema).toMatch(/credits\s+integer\s+not null\s+default\s+0/i);
    expect(schema).toMatch(
      /insert into public\.profiles\s*\([\s\S]*?credits[\s\S]*?\)\s*values\s*\([\s\S]*?0[\s\S]*?\)\s*on conflict \(user_id\) do nothing/i,
    );

    const webSchema = source("../../../../edutu-web-app/supabase/schema.sql");
    expect(webSchema).toMatch(/credits\s+integer\s+not null\s+default\s+0/i);
    expect(webSchema).toMatch(
      /insert into public\.profiles\s*\([\s\S]*?credits[\s\S]*?\)\s*values\s*\([\s\S]*?0[\s\S]*?\)\s*on conflict \(user_id\) do nothing/i,
    );
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
    const mobileSchema = source("../../../../edutumobile/supabase_schema.sql");
    expect(mobileSchema).toMatch(
      /insert into public\.profiles\s*\([\s\S]*?credits[\s\S]*?\)\s*values\s*\([\s\S]*?0[\s\S]*?\)/i,
    );

    const seed = source("../../../../edutumobile/supabase/seed.sql");
    const profileStatements = seed.match(
      /insert into public\.profiles[\s\S]*?on conflict \(user_id\) do nothing;/gi,
    );
    expect(profileStatements).toHaveLength(3);
    for (const statement of profileStatements ?? []) {
      expect(statement).toMatch(/\bcredits\b/i);
      expect(statement).toMatch(/,\s*0\s*,/i);
      expect(statement).not.toMatch(/credits_balance|\b150\b|\b5000\b/i);
    }
  });
});
