from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)


path = Path("edutumobile/app/(app)/opportunities/[id].tsx")
text = path.read_text()

text = replace_once(
    text,
    '  getMatchTier,\n  previewText,\n} from "../../../lib/opportunityDisplay";',
    '  getMatchTier,\n  previewText,\n  shouldShowOpportunitySummary,\n} from "../../../lib/opportunityDisplay";',
    "import summary distinctness helper",
)

match_risks = """  const matchRisks = (opportunity.matchRisks || [])
    .map((item) => decodeMaybe(item).trim())
    .filter(Boolean);
"""
match_presentation = match_risks + """  const showAiSummary = shouldShowOpportunitySummary(aiSummary, description);
  const displayTags = Array.from(
    new Set(
      (opportunity.aiTags || [])
        .map((tag) => decodeMaybe(tag).trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);
"""
text = replace_once(
    text,
    match_risks,
    match_presentation,
    "derive summary and tag presentation",
)

fit_start = text.index("          {/* ── FIT")
facts_start = text.index("          {/* ── FACTS", fit_start)
fit_block = text[fit_start:facts_start]
text = text[:fit_start] + text[facts_start:]
fit_block = fit_block.replace(
    '<View style={{ marginTop: 22 }}>',
    '<View>',
    1,
)

tag_start = text.index(
    "          {opportunity.aiTags && opportunity.aiTags.length > 0 && ("
)
reference_start = text.index("          {/* ── REFERENCE", tag_start)
tag_block = text[tag_start:reference_start]
text = text[:tag_start] + text[reference_start:]
tag_block = tag_block.replace(
    "opportunity.aiTags && opportunity.aiTags.length > 0",
    "displayTags.length > 0",
    1,
).replace(
    "opportunity.aiTags.map",
    "displayTags.map",
    1,
)

plan_start = text.index("          {/* ── PLAN")
publisher_start = text.index(
    "          {/* Publisher-supplied preparation steps",
    plan_start,
)
plan_block = text[plan_start:publisher_start]
text = text[:plan_start] + text[publisher_start:]

text = replace_once(
    text,
    """              title={t("detail.aboutTitle")}
              defaultExpanded
              preview={previewText(aiSummary || description)}
""",
    """              title={t("detail.aboutTitle")}
              defaultExpanded
              progressiveDisclosure
              collapsedBodyHeight={260}
              viewMoreLabel={t("detail.viewFullDetails", {
                defaultValue: "View full details",
              })}
              showLessLabel={t("detail.showLess", {
                defaultValue: "Show less",
              })}
              preview={previewText(showAiSummary ? aiSummary : description)}
""",
    "upgrade About progressive disclosure",
)

text = replace_once(
    text,
    "              {aiSummary && aiSummary !== description ? (",
    "              {showAiSummary ? (",
    "suppress repeated summary",
)

text = replace_once(
    text,
    "                <RequirementChecklist opportunityId={opportunity.id} items={requirements} />",
    """                <RequirementChecklist
                  opportunityId={opportunity.id}
                  items={requirements}
                  progressLabel={(checked, total) =>
                    t("detail.requirementsProgress", {
                      checked,
                      total,
                      defaultValue: "{{checked}} of {{total}} checked",
                    })
                  }
                />""",
    "add requirement progress copy",
)

support_open = "\n".join(
    [
        "          {/* ── APPLICATION SUPPORT ──────────────────────────────────────────",
        "              Optional tools are grouped after the learner has read the source",
        "              facts, requirements, benefits and application steps. */}",
        "          <View style={{ marginTop: 8 }}>",
        "            <CollapsibleSection",
        '              title={t("detail.applicationSupportTitle", {',
        '                defaultValue: "Help me apply",',
        "              })}",
        '              preview={t("detail.applicationSupportPreview", {',
        "                defaultValue:",
        '                  "Check your fit, review your CV, get the next move, or build a step-by-step plan.",',
        "              })}",
        "            >",
        "              <View style={styles.applicationSupportBody}>",
    ]
)
support_close = "\n".join(
    [
        "              </View>",
        "            </CollapsibleSection>",
        "          </View>",
        "",
        "",
    ]
)
support_block = support_open + "\n" + fit_block + plan_block + support_close

publisher_start = text.index(
    "          {/* Publisher-supplied preparation steps"
)
text = (
    text[:publisher_start]
    + tag_block
    + support_block
    + text[publisher_start:]
)

text = replace_once(
    text,
    '  summaryText: { fontSize: 14, lineHeight: 21 },\n',
    '  summaryText: { fontSize: 15, lineHeight: 22 },\n',
    "increase summary readability",
)
text = replace_once(
    text,
    '  description: { fontSize: 13, lineHeight: 21, marginBottom: 22 },\n',
    '  description: { fontSize: 15, lineHeight: 24, marginBottom: 8 },\n',
    "increase description readability",
)
text = replace_once(
    text,
    '  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },\n',
    """  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 14,
    marginBottom: 4,
  },
""",
    "refine tag spacing",
)
text = replace_once(
    text,
    '  askMoreChipText: { fontSize: 13, fontWeight: "700" },\n',
    '  askMoreChipText: { fontSize: 13, fontWeight: "700" },\n  applicationSupportBody: { gap: 4 },\n',
    "add application support spacing",
)

path.write_text(text)
