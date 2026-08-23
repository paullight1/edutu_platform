export interface BlogImageType {
  extension: "jpg" | "png" | "webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function hasPrefix(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, index) => buffer[index] === byte);
}

/**
 * Detect the small set of raster image formats accepted by the public blog.
 *
 * Browser-provided MIME types and filenames are untrusted. SVG/HTML and every
 * unknown format are rejected so an upload cannot become executable markup in
 * the public storage bucket merely by claiming an image/* content type.
 */
export function detectBlogImageType(buffer: Buffer): BlogImageType | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  if (hasPrefix(buffer, PNG_SIGNATURE)) {
    return { extension: "png", contentType: "image/png" };
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", contentType: "image/jpeg" };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { extension: "webp", contentType: "image/webp" };
  }

  return null;
}
