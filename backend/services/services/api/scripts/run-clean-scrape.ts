/**
 * One-off clean-scrape runner: boots the app context, scrapes ONE source with
 * maxPages=1 through the exact production pipeline, and prints the RunOutcome
 * cleanliness report plus sample records.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/run-clean-scrape.ts [sourceId]
 */
import { NestFactory } from "@nestjs/core";
import { createClient } from "@supabase/supabase-js";
import { AppModule } from "../src/app.module";
import { ScraperService } from "../src/scraper/scraper.service";

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "warn", "error"],
  });

  try {
    const scraper = app.get(ScraperService);

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const requestedId = Number(process.argv[2]) || null;
    const { data: sources, error } = await supabase
      .from("scraping_sources")
      .select("id, name, url, enabled, is_group, priority")
      .eq("enabled", true)
      .eq("is_group", false)
      .order("priority")
      .limit(10);
    if (error) throw new Error(`Could not list sources: ${error.message}`);

    console.log("── Enabled sources ──");
    (sources ?? []).forEach((s) =>
      console.log(`  #${s.id} ${s.name} — ${s.url}`),
    );

    const target = requestedId
      ? (sources ?? []).find((s) => s.id === requestedId)
      : (sources ?? [])[0];
    if (!target) throw new Error("No enabled source to scrape");

    console.log(
      `\n── Running clean scrape: #${target.id} ${target.name} (maxPages=1) ──\n`,
    );
    const started = Date.now();
    // Call the inner pipeline directly: the advisory lock needs the local
    // Postgres (not running here) and only guards against concurrent crawls,
    // which can't happen in this supervised one-off run.
    const result = await (scraper as any).executeScraperRun({
      sourceId: target.id,
      maxPages: 1,
    });

    const { opportunities, ...summary } = result as Record<string, any>;
    console.log("\n══ SCRAPE RESULT ══");
    console.log(JSON.stringify(summary, null, 2));

    console.log("\n══ SAMPLE RECORDS (first 6) ══");
    for (const o of (opportunities ?? []).slice(0, 6)) {
      console.log(
        JSON.stringify(
          {
            title: o.title,
            deadline: o.deadline ?? null,
            image: o.image_url ? "yes" : "no",
            source_image: o.source_image_url ?? null,
            direct_apply: o.direct_apply_url ? "yes" : "no",
            summary_chars: (o.summary ?? "").length,
            description_chars: (o.description ?? "").length,
            requirements: (o.requirements ?? []).length,
            benefits: (o.benefits ?? []).length,
          },
          null,
          2,
        ),
      );
    }
    console.log(
      `\nDone in ${Math.round((Date.now() - started) / 1000)}s`,
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error("Clean scrape failed:", err);
  process.exit(1);
});
