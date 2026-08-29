import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import OpportunityRails, {
  type OpportunityRail,
} from "../../components/opportunity/OpportunityRails";
import type { Opportunity } from "../../types/opportunity";

function opportunity(id: string): Opportunity {
  return {
    id,
    title: `Opportunity ${id}`,
    organization: "Edutu Foundation",
    category: "Scholarship",
    location: "Remote",
    description: "A test opportunity",
    requirements: [],
    benefits: [],
    applicationProcess: [],
    match: 80,
  };
}

function rail(key: string, title: string): OpportunityRail {
  return {
    key,
    title,
    Icon: Sparkles,
    accent: "bg-brand/10 text-brand",
    items: [1, 2, 3, 4].map((item) => opportunity(`${key}-${item}`)),
  };
}

describe("OpportunityRails alignment", () => {
  it.each([
    ["latest", "Just added"],
    ["closing", "Closing soon"],
  ])("keeps the %s card track on the section's content axis", (key, title) => {
    render(
      <MemoryRouter>
        <OpportunityRails
          rails={[rail(key, title)]}
          detailPathFor={(item) => `/opportunity/${item.id}`}
          getPalette={() => ({ chip: "bg-brand/10 text-brand" })}
        />
      </MemoryRouter>,
    );

    const section = screen.getByRole("region", { name: title });
    const cardTrack = section.querySelector(".overflow-x-auto");

    expect(cardTrack).not.toBeNull();
    expect(cardTrack).not.toHaveClass("-mx-4", "sm:-mx-6", "lg:-mx-8");
    expect(cardTrack).not.toHaveClass("px-4", "sm:px-6", "lg:px-8");
  });
});
