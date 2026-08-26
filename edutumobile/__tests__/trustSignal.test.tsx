import React from "react";
import { render } from "@testing-library/react-native";
import { TrustSignal } from "../components/opportunity/TrustSignal";

describe("TrustSignal", () => {
  it("shows verified, freshness, and rolling-deadline evidence", () => {
    const { getByText } = render(
      <TrustSignal
        mutedColor="#64748b"
        trust={{
          verificationStatus: "verified",
          lastVerifiedAt: new Date().toISOString(),
          deadlineConfidence: "rolling",
          verificationMethod: "official_source_http",
          sourceDomain: "example.org",
        }}
      />,
    );

    expect(getByText("Verified")).toBeTruthy();
    expect(getByText(/Checked/)).toBeTruthy();
    expect(getByText("Rolling deadline")).toBeTruthy();
  });

  it("renders nothing without positive evidence", () => {
    const { toJSON } = render(
      <TrustSignal
        mutedColor="#64748b"
        trust={{
          verificationStatus: "unverified",
          lastVerifiedAt: null,
          deadlineConfidence: null,
          verificationMethod: null,
          sourceDomain: "example.org",
        }}
      />,
    );

    expect(toJSON()).toBeNull();
  });
});
