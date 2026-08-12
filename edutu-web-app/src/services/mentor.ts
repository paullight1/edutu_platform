import { getApiBaseUrl } from "../lib/apiBaseUrl";

export interface MentorStats {
  publishedContent: number;
  learnersReached: number;
  creditsEarned: number;
  walletBalance: number;
  avgRating: number | null;
  ratingCount: number;
  mentorStatus: string;
}

export interface MentorListing {
  id: string;
  title: string;
  category: string;
  status: string;
  price: number;
  enrollmentCount: number;
}

export interface MentorDashboard {
  listings: MentorListing[];
  totalListings: number;
  totalEnrollments: number;
  totalEarnings: number;
  platformFeePercent: number;
  creatorCutPercent: number;
  stats: MentorStats;
}

export interface MentorApplicationStatus {
  status: string | null;
  application_kind?: string | null;
}

export interface MentorApplicationInput {
  displayName: string;
  email: string;
  phoneNumber: string;
  country: string;
  bio: string;
  contentType: string;
  experience?: string;
  motivation?: string;
  linkedinUrl?: string;
  portfolioUrl?: string;
  sampleContentUrl?: string;
  proofPath?: string;
  proofFileName?: string;
  proofFileType?: string;
  proofFileSize?: number;
  consentAccepted: boolean;
}

export interface MentorApplicationSubmission {
  id: string;
  status: string;
  applicationKind: "mentor";
}

async function requestMentor<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Mentor API");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      data?.message || data?.error?.message || "Mentor request failed",
    );
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data as T;
}

export function getMentorDashboard(token: string) {
  return requestMentor<MentorDashboard>("/creator/dashboard", token);
}

export function getMentorStatus(token: string) {
  return requestMentor<MentorApplicationStatus | null>(
    "/creator/status",
    token,
  );
}

export function submitMentorApplication(
  token: string,
  application: MentorApplicationInput,
) {
  return requestMentor<MentorApplicationSubmission>("/creator/apply", token, {
    method: "POST",
    body: JSON.stringify({
      ...application,
      applicationKind: "mentor",
    }),
  });
}
