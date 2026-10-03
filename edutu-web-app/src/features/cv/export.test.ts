import { expect, it } from "vitest";
import { buildCVHtml, buildCVText } from "./export";
it("exports research and publications even when switching to a general template", () => {
  const cv = {
    name: "CV",
    template_id: "minimal-ats",
    data_json: {
      header: { full_name: "Amara <script>", email: "a@example.com" },
      research: [
        {
          title: "Malaria study",
          institution: "University",
          description: "Findings",
        },
      ],
      publications: [
        { title: "Paper", journal: "Science", authors: "Amara", date: "2025" },
      ],
    },
  };
  const html = buildCVHtml(cv as unknown as import("./types").UserCV);
  expect(html).toContain("Malaria study");
  expect(html).toContain("Paper");
  expect(html).not.toContain("<script>");
  expect(buildCVText(cv as unknown as import("./types").UserCV)).toContain(
    "Malaria study",
  );
});
