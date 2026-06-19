import type { Opportunity } from "../types/opportunity";
import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { getLocalDevAuthHeaders } from "../lib/localDevAuthHeaders";

export interface OpportunityShareCard {
  url: string;
  path: string;
  format: "png" | "svg";
  generatedAt: string;
  fingerprint: string;
  expiresAt: string | null;
}

export interface OpportunitySharePreview extends OpportunityShareCard {
  shareText?: string;
  shareUrl?: string;
}

interface OpportunityShareResponse {
  success?: boolean;
  opportunityId?: string;
  shareCard?: OpportunityShareCard | null;
  shareUrl?: string;
  shareText?: string;
  error?: string;
}

const textEncoder = new TextEncoder();

function normalizeText(
  value: string | null | undefined,
  fallback = "",
): string {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || fallback;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const trimmed = value.slice(0, maxLength - 1).trimEnd();
  return `${trimmed}…`;
}

function slugify(value: string, fallback = "edutu-opportunity"): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function formatShareDeadline(value?: string | null): string {
  if (!value) return "Not Specified";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return truncateText(normalizeText(value, "Not Specified"), 80);
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(value?: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getEligibleCountry(opportunity: Opportunity): string {
  const countries = Array.isArray(opportunity.eligibility?.countries)
    ? opportunity.eligibility.countries
        .map((country) => normalizeText(String(country)))
        .filter(Boolean)
    : [];

  if (countries.length > 0) {
    return countries.length > 3
      ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`
      : countries.join(", ");
  }

  return normalizeText(opportunity.location, "All Countries");
}

function getShareBenefits(opportunity: Opportunity): string[] {
  const benefits = Array.isArray(opportunity.benefits)
    ? opportunity.benefits
        .map((benefit) => truncateText(normalizeText(benefit), 90))
        .filter(Boolean)
    : [];

  return benefits.slice(0, 2);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);

  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function buildSingleImagePdf(
  imageBytes: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  const add = (chunk: Uint8Array) => {
    parts.push(chunk);
    byteLength += chunk.length;
  };

  const addText = (value: string) => add(textEncoder.encode(value));

  const addObject = (objectNumber: number, body: Uint8Array) => {
    offsets[objectNumber] = byteLength;
    addText(`${objectNumber} 0 obj\n`);
    add(body);
    addText("\nendobj\n");
  };

  addText("%PDF-1.4\n");

  addObject(1, textEncoder.encode("<< /Type /Catalog /Pages 2 0 R >>"));
  addObject(2, textEncoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  addObject(
    3,
    textEncoder.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );

  const imageHeader = textEncoder.encode(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
  );
  const imageFooter = textEncoder.encode("\nendstream");
  addObject(4, concatBytes([imageHeader, imageBytes, imageFooter]));

  const contentStream = textEncoder.encode(
    `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ`,
  );
  const contentHeader = textEncoder.encode(
    `<< /Length ${contentStream.length} >>\nstream\n`,
  );
  const contentFooter = textEncoder.encode("\nendstream");
  addObject(5, concatBytes([contentHeader, contentStream, contentFooter]));

  const xrefOffset = byteLength;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    xref += `${String(offsets[index] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  addText(xref);

  return concatBytes(parts);
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Unable to load share image from ${url}`));
    image.src = url;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Could not convert the share image to a blob."));
        }
      },
      type,
      quality,
    );
  });
}

export function buildOpportunityShareUrl(opportunityId: string): string {
  const path = `/share/opportunity/${encodeURIComponent(opportunityId)}`;

  if (typeof window === "undefined" || !window.location?.origin) {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

export function buildOpportunityShareText(
  opportunity: Opportunity,
  shareUrl: string,
): string {
  const title = normalizeText(opportunity.title, "Edutu opportunity");
  const sponsor = normalizeText(opportunity.organization, "Edutu");
  const category = normalizeText(opportunity.category, "Opportunity");
  const statusLine = isExpired(opportunity.deadline)
    ? "Deadline Passed"
    : "Still Active";
  const benefits = getShareBenefits(opportunity);
  const benefitLines = (
    benefits.length > 0 ? benefits : ["Full details available on Edutu"]
  )
    .map((benefit) => `- ${benefit}`)
    .join("\n");

  return [
    `${statusLine}!`,
    "",
    title,
    "",
    `Sponsor: ${sponsor}`,
    "",
    "Benefits:",
    benefitLines,
    "",
    `Category: ${category}`,
    `Eligible Country: ${getEligibleCountry(opportunity)}`,
    `Deadline: ${formatShareDeadline(opportunity.deadline)}`,
    "",
    "Open the link below to view the preview.",
    shareUrl,
    "",
    "Share this with anyone who needs the link.",
  ].join("\n");
}

export function buildWhatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildOpportunityShareFileName(
  opportunity: Opportunity,
  extension: "pdf" | "png" | "svg" = "pdf",
): string {
  return `${slugify(opportunity.title)}-edutu.${extension}`;
}

export async function fetchOpportunityShareCard(
  opportunityId: string,
): Promise<OpportunitySharePreview | null> {
  try {
    const apiBaseUrl = getApiBaseUrl("Opportunity Share API");
    const response = await fetch(
      `${apiBaseUrl}/opportunities/${encodeURIComponent(opportunityId)}/share-card`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLocalDevAuthHeaders(),
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response
      .json()
      .catch(() => null)) as OpportunityShareResponse | null;
    if (!payload?.success || !payload.shareCard?.url) {
      return null;
    }

    return {
      ...payload.shareCard,
      shareText: payload.shareText,
      shareUrl: payload.shareUrl,
    };
  } catch {
    return null;
  }
}

export async function fetchOpportunityShareImageBlob(
  opportunityId: string,
): Promise<{
  blob: Blob;
  card: OpportunityShareCard;
  shareText?: string;
  shareUrl?: string;
} | null> {
  let payload: OpportunityShareResponse | null = null;

  try {
    const apiBaseUrl = getApiBaseUrl("Opportunity Share API");
    const shareResponse = await fetch(
      `${apiBaseUrl}/opportunities/${encodeURIComponent(opportunityId)}/share-card`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getLocalDevAuthHeaders(),
        },
      },
    );
    if (!shareResponse.ok) return null;

    payload = (await shareResponse
      .json()
      .catch(() => null)) as OpportunityShareResponse | null;
    const card = payload?.shareCard;
    if (!payload?.success || !card?.url) return null;

    const response = await fetch(card.url);
    if (!response.ok) {
      return null;
    }

    return {
      blob: await response.blob(),
      card,
      shareText: payload.shareText,
      shareUrl: payload.shareUrl,
    };
  } catch {
    return null;
  }
}

export async function fetchOpportunitySharePdfBlob(
  opportunityId: string,
  fallbackImageUrl?: string | null,
): Promise<Blob | null> {
  try {
    const apiBaseUrl = getApiBaseUrl("Opportunity Share PDF API");
    const response = await fetch(
      `${apiBaseUrl}/opportunities/${encodeURIComponent(opportunityId)}/share-pdf`,
      {
        method: "GET",
        headers: {
          ...getLocalDevAuthHeaders(),
        },
      },
    );

    if (response.ok) {
      return await response.blob();
    }
  } catch {
    // Fall back to browser-side PDF generation below.
  }

  if (fallbackImageUrl) {
    return createOpportunityPdfFromImageUrl(fallbackImageUrl);
  }

  return null;
}

export async function createOpportunityPdfFromImageUrl(
  imageUrl: string,
): Promise<Blob | null> {
  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const width = image.naturalWidth || image.width || 1080;
    const height = image.naturalHeight || image.height || 1080;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);

    const jpegBlob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
    const pdfBytes = buildSingleImagePdf(jpegBytes, width, height);
    const pdfArrayBuffer = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(pdfArrayBuffer).set(pdfBytes);

    return new Blob([pdfArrayBuffer], { type: "application/pdf" });
  } catch {
    return null;
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
