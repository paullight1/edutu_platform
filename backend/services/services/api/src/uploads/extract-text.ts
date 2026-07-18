import { UnsupportedMediaTypeException } from "@nestjs/common";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Mime types the win-coach can turn into plain text (matches the cv-files bucket allow-list). */
export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  DOCX_MIME,
  "application/msword",
  "text/plain",
] as const;

/**
 * Extract plain text from an uploaded document buffer so the agent can read the
 * user's real materials. Throws UnsupportedMediaTypeException for anything not
 * in SUPPORTED_UPLOAD_MIME_TYPES.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text ?? "").trim();
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === DOCX_MIME || mimeType === "application/msword") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? "").trim();
  }
  if (mimeType === "text/plain") {
    return buffer.toString("utf8").trim();
  }
  throw new UnsupportedMediaTypeException(
    `Unsupported document type: ${mimeType}`,
  );
}
