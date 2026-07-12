#!/usr/bin/env node
/**
 * One-off: copy users from the Clerk DEV instance (calm-gecko-44, where all
 * testing happened) into the PRODUCTION instance (clerk.edutu.org).
 *
 * Creates each dev user in prod with their verified email + name. When they
 * next sign in on prod (Google OAuth or email code), Clerk links them to this
 * account by email — no passwords are migrated (Clerk never exposes them).
 *
 * Usage:
 *   CLERK_DEV_SECRET_KEY=sk_test_... CLERK_SECRET_KEY=sk_live_... \
 *     node scripts/migrate-clerk-users.mjs            # dry run (prints plan)
 *   ... node scripts/migrate-clerk-users.mjs --apply  # actually create users
 */

const DEV_KEY = process.env.CLERK_DEV_SECRET_KEY;
const PROD_KEY = process.env.CLERK_SECRET_KEY;
const APPLY = process.argv.includes("--apply");
const API = "https://api.clerk.com/v1";

if (!DEV_KEY || !PROD_KEY) {
  console.error(
    "Set CLERK_DEV_SECRET_KEY (sk_test_...) and CLERK_SECRET_KEY (sk_live_...).",
  );
  process.exit(1);
}
if (!DEV_KEY.startsWith("sk_test_") || !PROD_KEY.startsWith("sk_live_")) {
  console.error(
    "Refusing: CLERK_DEV_SECRET_KEY must be sk_test_* and CLERK_SECRET_KEY sk_live_* (wrong direction would pollute prod).",
  );
  process.exit(1);
}

async function clerk(key, path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.errors?.[0]?.message || response.statusText;
    throw new Error(`${options.method || "GET"} ${path} → ${response.status} ${message}`);
  }
  return body;
}

async function listAllUsers(key) {
  const users = [];
  for (let offset = 0; ; offset += 100) {
    const page = await clerk(key, `/users?limit=100&offset=${offset}&order_by=-created_at`);
    users.push(...page);
    if (page.length < 100) break;
  }
  return users;
}

function primaryEmail(user) {
  const primary = user.email_addresses?.find(
    (e) => e.id === user.primary_email_address_id,
  );
  return (primary || user.email_addresses?.[0])?.email_address?.toLowerCase() || null;
}

const [devUsers, prodUsers] = await Promise.all([
  listAllUsers(DEV_KEY),
  listAllUsers(PROD_KEY),
]);
const prodEmails = new Set(prodUsers.map(primaryEmail).filter(Boolean));

console.log(`Dev instance users:  ${devUsers.length}`);
console.log(`Prod instance users: ${prodUsers.length}`);

let created = 0;
let skipped = 0;
let failed = 0;

for (const user of devUsers) {
  const email = primaryEmail(user);
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "(no name)";

  if (!email) {
    console.log(`skip  ${user.id} ${name} — no email address`);
    skipped += 1;
    continue;
  }
  if (prodEmails.has(email)) {
    console.log(`skip  ${email} — already in prod`);
    skipped += 1;
    continue;
  }

  if (!APPLY) {
    console.log(`would create  ${email}  (${name})`);
    created += 1;
    continue;
  }

  try {
    await clerk(PROD_KEY, "/users", {
      method: "POST",
      body: JSON.stringify({
        email_address: [email],
        first_name: user.first_name || undefined,
        last_name: user.last_name || undefined,
        skip_password_requirement: true,
        // Preserve role/flags admins set during testing.
        public_metadata: user.public_metadata || {},
        // Breadcrumb back to the dev identity for later data reconciliation.
        private_metadata: { migrated_from_dev_user_id: user.id },
      }),
    });
    prodEmails.add(email);
    console.log(`created  ${email}  (${name})`);
    created += 1;
  } catch (error) {
    console.error(`FAILED  ${email} — ${error.message}`);
    failed += 1;
  }
}

console.log(
  `\n${APPLY ? "Done" : "Dry run"}: ${created} ${APPLY ? "created" : "to create"}, ${skipped} skipped, ${failed} failed.`,
);
if (!APPLY) console.log("Re-run with --apply to perform the migration.");
