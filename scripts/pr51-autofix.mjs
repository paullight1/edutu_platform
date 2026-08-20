import { readFileSync, writeFileSync } from 'node:fs';

function replaceExact(path, oldText, newText, marker) {
  const text = readFileSync(path, 'utf8');
  if (text.includes(oldText)) {
    writeFileSync(path, text.replace(oldText, newText), 'utf8');
    return;
  }
  if (text.includes(marker)) return;
  throw new Error(`Expected original or patched marker not found in ${path}`);
}

replaceExact(
  'edutumobile/app/(app)/paywall.tsx',
  "  const canUpgrade = planTier === 'none' || planTier === 'lite';",
  `  // planTier is canonical. isPro is a backwards-compatible fallback for
  // older/mocked status providers that have not supplied planTier yet.
  const canUpgrade = planTier == null
    ? !isPro
    : planTier === 'none' || planTier === 'lite';`,
  'const canUpgrade = planTier == null',
);

replaceExact(
  'edutumobile/app/(app)/profile/edit.tsx',
  `            // Persist straight to Supabase, keyed by the raw Clerk id. RLS
            // authorizes the write (current_app_user_id() = user_id) and it
            // lands on the row the rest of the app reads — no dependence on the
            // product API, which was rejecting the mobile token (401 → the old
            // "silent not-saving" bug).
            const { error: createError } = await supabase
                .from('profiles')
                .upsert(
                    {
                        user_id: user.id,
                        credits: 0,
                    },
                    { onConflict: 'user_id', ignoreDuplicates: true },
                );

            if (createError) throw createError;

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: toNullable(profile.full_name),
                    country: toNullable(profile.country),
                    school: toNullable(profile.school),
                    major: toNullable(profile.major),
                    cgpa: cgpaValue,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', user.id);

            if (error) throw error;
`,
  `            // Persist only self-service profile fields. The database owns
            // protected account state (credits, role, Pro/subscription flags).
            // On first insert credits receives its schema default of 0; on
            // conflict this upsert cannot reset an existing balance because the
            // protected column is absent from the payload. UPDATE(user_id) is
            // grant-safe and RLS still pins the row to the current Clerk user.
            const { error } = await supabase
                .from('profiles')
                .upsert(
                    {
                        user_id: user.id,
                        full_name: toNullable(profile.full_name),
                        country: toNullable(profile.country),
                        school: toNullable(profile.school),
                        major: toNullable(profile.major),
                        cgpa: cgpaValue,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: 'user_id' },
                );

            if (error) throw error;
`,
  'Persist only self-service profile fields',
);

replaceExact(
  'backend/services/services/api/src/profile/profile-creation.contract.spec.ts',
  `  it("covers mobile and web profile bootstraps without resetting balances", () => {
    const mobileWebhook = source(
      "../../../../edutumobile/supabase/functions/clerk-webhook/index.ts",
    );
    const mobileEdit = source(
      "../../../../edutumobile/app/(app)/profile/edit.tsx",
    );
    const webAuth = source("../../../../edutu-web-app/src/lib/auth.ts");

    for (const profilePath of [mobileWebhook, mobileEdit, webAuth]) {
      expect(profilePath).toMatch(/credits:\\s*0/);
      expect(profilePath).toMatch(/ignoreDuplicates:\\s*true/);
      expect(profilePath).toMatch(/\\.update\\(/);
    }
  });
`,
  `  it("keeps trusted bootstrap explicit while client profile writes stay credit-free", () => {
    const mobileWebhook = source(
      "../../../../edutumobile/supabase/functions/clerk-webhook/index.ts",
    );
    const mobileEdit = source(
      "../../../../edutumobile/app/(app)/profile/edit.tsx",
    );
    const webAuth = source("../../../../edutu-web-app/src/lib/auth.ts");

    expect(mobileWebhook).toMatch(
      /credits:\\s*0[\\s\\S]*?ignoreDuplicates:\\s*true/,
    );

    const mobileUpsert = mobileEdit.match(
      /\\.upsert\\(\\s*\\{([\\s\\S]*?)\\}\\s*,\\s*\\{\\s*onConflict:\\s*['\"]user_id['\"]\\s*\\}\\s*\\)/,
    );
    expect(mobileUpsert).not.toBeNull();
    expect(mobileUpsert?.[1]).not.toMatch(/\\bcredits\\s*:/);

    const insertColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_INSERT_COLUMNS = \\[([\\s\\S]*?)\\] as const;/,
    );
    const updateColumns = webAuth.match(
      /const SELF_SERVICE_PROFILE_UPDATE_COLUMNS = \\[([\\s\\S]*?)\\] as const;/,
    );
    expect(insertColumns).not.toBeNull();
    expect(updateColumns).not.toBeNull();
    expect(insertColumns?.[1]).not.toMatch(/[\"']credits[\"']/);
    expect(updateColumns?.[1]).not.toMatch(/[\"']credits[\"']/);
    expect(webAuth).toMatch(/buildSelfServiceProfileInsert\\(profile\\)/);
    expect(webAuth).toMatch(/buildSelfServiceProfileUpdate\\(profile\\)/);
  });
`,
  'keeps trusted bootstrap explicit while client profile writes stay credit-free',
);

const mobileEdit = readFileSync('edutumobile/app/(app)/profile/edit.tsx', 'utf8');
if (mobileEdit.includes("user_id: user.id,\n                        credits: 0")) {
  throw new Error('Mobile profile editor still writes protected credits');
}
if (!mobileEdit.includes("{ onConflict: 'user_id' }")) {
  throw new Error('Mobile profile upsert conflict contract missing');
}

const paywall = readFileSync('edutumobile/app/(app)/paywall.tsx', 'utf8');
if (!paywall.includes('planTier == null') || !paywall.includes('? !isPro')) {
  throw new Error('Paywall compatibility fallback missing');
}

const contract = readFileSync(
  'backend/services/services/api/src/profile/profile-creation.contract.spec.ts',
  'utf8',
);
if (!contract.includes('client profile writes stay credit-free')) {
  throw new Error('Profile creation contract was not updated');
}

console.log('PR #51 scoped corrective patch applied and verified.');
