import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TrustSignal from "./TrustSignal";

describe("TrustSignal", () => {
  it("shows verified, freshness, and inferred-deadline evidence", () => {
    render(
      <TrustSignal
        trust={{
          verificationStatus: "verified",
          lastVerifiedAt: new Date().toISOString(),
          deadlineConfidence: "inferred",
          verificationMethod: "official_source_http",
          sourceDomain: "example.org",
        }}
      />,
    );

    expect(screen.getByText("Verified")).toBeVisible();
    expect(screen.getByText(/Checked .*ago/)).toBeVisible();
    expect(screen.getByText("Estimated deadline")).toBeVisible();
  });

  it("renders nothing when the projection contains no positive evidence", () => {
    const { container } = render(
      <TrustSignal
        trust={{
          verificationStatus: "unverified",
          lastVerifiedAt: null,
          deadlineConfidence: null,
          verificationMethod: null,
          sourceDomain: "example.org",
        }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("clarifies that a checked source does not confirm a deadline that needs review", () => {
    render(
      <TrustSignal
        trust={{
          verificationStatus: "verified",
          lastVerifiedAt: null,
          deadlineConfidence: "explicit",
          deadlineNeedsReview: true,
          verificationMethod: "official_source_http",
          sourceDomain: "example.org",
        }}
      />,
    );

    expect(screen.getByText("Source checked")).toBeVisible();
    expect(screen.queryByText("Verified")).toBeNull();
    expect(screen.getByText("Verify deadline")).toBeVisible();
    expect(screen.getByText("Source checked").closest("span")).toHaveAttribute(
      "title",
      "Edutu checked this opportunity's source page, but the deadline still needs review.",
    );
  });
});
