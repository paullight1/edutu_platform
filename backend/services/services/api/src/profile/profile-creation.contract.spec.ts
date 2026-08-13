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
});
