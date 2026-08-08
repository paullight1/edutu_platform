import { getApiBaseUrl } from "../lib/apiBaseUrl";

/**
 * Admin-managed content for the web app (admin panel → Settings → Web Content),
 * served unauthenticated by the backend. Falls back to built-in defaults on any
 * failure so callers keep their hardcoded defaults.
 */
export interface HeroBanner {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl?: string;
  enabled: boolean;
}

export interface WebAnnouncement {
  enabled: boolean;
  text: string;
  linkUrl: string;
  linkLabel: string;
}

export const DEFAULT_WEB_ANNOUNCEMENT: WebAnnouncement = {
  enabled: true,
  text: "Help Edutu For You reach 1 million young people with access to global opportunities.",
  linkUrl: "/edutuforyou",
  linkLabel: "See Edutu For You",
};

/**
 * Admin-controlled policy for user opportunity submissions (Settings →
 * Content → User submissions). Display-only on the client — the backend
 * enforces the fee and review status server-side.
 */
export interface SubmissionsPolicy {
  requireApproval: boolean;
  paidSubmissions: boolean;
  costCredits: number;
}

export const DEFAULT_SUBMISSIONS_POLICY: SubmissionsPolicy = {
  requireApproval: true,
  paidSubmissions: false,
  costCredits: 0,
};

let cachedBanners: HeroBanner[] | null = null;
let cachedAnnouncement: WebAnnouncement | null = null;
let cachedSubmissionsPolicy: SubmissionsPolicy | null = null;

export async function fetchWebAnnouncement(): Promise<WebAnnouncement> {
  if (cachedAnnouncement) return cachedAnnouncement;

  try {
    const response = await fetch(
      `${getApiBaseUrl("Web config API")}/public/web-config`,
    );
    if (!response.ok) return DEFAULT_WEB_ANNOUNCEMENT;

    const data = (await response.json()) as {
      announcement?: Partial<WebAnnouncement>;
    };
    const announcement = data?.announcement;
    if (!announcement || typeof announcement.text !== "string") {
      return DEFAULT_WEB_ANNOUNCEMENT;
    }

    const resolved: WebAnnouncement = {
      enabled: announcement.enabled !== false,
      text: announcement.text.trim(),
      linkUrl:
        typeof announcement.linkUrl === "string"
          ? announcement.linkUrl.trim()
          : DEFAULT_WEB_ANNOUNCEMENT.linkUrl,
      linkLabel:
        typeof announcement.linkLabel === "string" && announcement.linkLabel.trim()
          ? announcement.linkLabel.trim()
          : DEFAULT_WEB_ANNOUNCEMENT.linkLabel,
    };
    cachedAnnouncement = resolved;
    return resolved;
  } catch {
    return DEFAULT_WEB_ANNOUNCEMENT;
  }
}

export async function fetchSubmissionsPolicy(): Promise<SubmissionsPolicy> {
  if (cachedSubmissionsPolicy) return cachedSubmissionsPolicy;

  try {
    const response = await fetch(
      `${getApiBaseUrl("Web config API")}/public/web-config`,
    );
    if (!response.ok) return DEFAULT_SUBMISSIONS_POLICY;

    const data = (await response.json()) as {
      submissions?: Partial<SubmissionsPolicy>;
    };
    const submissions = data?.submissions;
    if (!submissions || typeof submissions !== "object") {
      return DEFAULT_SUBMISSIONS_POLICY;
    }

    const policy: SubmissionsPolicy = {
      requireApproval:
        typeof submissions.requireApproval === "boolean"
          ? submissions.requireApproval
          : DEFAULT_SUBMISSIONS_POLICY.requireApproval,
      paidSubmissions:
        typeof submissions.paidSubmissions === "boolean"
          ? submissions.paidSubmissions
          : DEFAULT_SUBMISSIONS_POLICY.paidSubmissions,
      costCredits:
        typeof submissions.costCredits === "number" &&
        Number.isFinite(submissions.costCredits)
          ? Math.max(0, Math.round(submissions.costCredits))
          : DEFAULT_SUBMISSIONS_POLICY.costCredits,
    };

    cachedSubmissionsPolicy = policy;
    return policy;
  } catch {
    return DEFAULT_SUBMISSIONS_POLICY;
  }
}

export async function fetchHeroBanners(): Promise<HeroBanner[]> {
  if (cachedBanners) return cachedBanners;

  try {
    const response = await fetch(
      `${getApiBaseUrl("Web config API")}/public/web-config`,
    );
    if (!response.ok) return [];

    const data = (await response.json()) as { heroBanners?: HeroBanner[] };
    const banners = Array.isArray(data?.heroBanners)
      ? data.heroBanners.filter(
          (banner) =>
            banner &&
            banner.enabled !== false &&
            typeof banner.imageUrl === "string" &&
            banner.imageUrl.length > 0 &&
            typeof banner.title === "string",
        )
      : [];

    cachedBanners = banners;
    return banners;
  } catch {
    return [];
  }
}
