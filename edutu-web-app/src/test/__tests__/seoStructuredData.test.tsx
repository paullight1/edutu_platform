import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import Seo from "../../components/Seo";

it("clears route-specific structured data on navigation and unmount", () => {
  const serverScript = document.createElement("script");
  serverScript.dataset.edutuSeoJsonld = "true";
  document.head.appendChild(serverScript);
  const props = { title: "Edutu", description: "Opportunity", path: "/opportunity/1" };
  const view = render(<Seo {...props} jsonLd={{ "@type": "WebPage", name: "First" }} />);
  expect(document.head.contains(serverScript)).toBe(false);
  expect(JSON.parse(document.head.querySelector('script[data-route-json-ld="true"]')!.textContent!).name).toBe("First");
  view.rerender(<Seo {...props} path="/help" />);
  expect(document.head.querySelector('script[data-route-json-ld="true"]')).toBeNull();
  view.rerender(<Seo {...props} jsonLd={{ "@type": "WebPage", name: "Second" }} />);
  view.unmount();
  expect(document.head.querySelector('script[data-route-json-ld="true"]')).toBeNull();
});
