import {
  CommunityApi,
  uploadCommunityAttachment,
} from "./api";
import {
  COMMUNITY_IMAGE_MAX_BYTES,
  COMMUNITY_IMAGE_MIME_TYPES,
  COMMUNITY_PDF_MAX_BYTES,
  serializeCommunityAttachment,
  type CommunityAttachmentKind,
  type CommunityAttachmentMime,
  type CommunityImageMime,
  type CommunityMessage,
} from "./types";

const ATTACHMENT_ERROR =
  "Choose a JPEG, PNG, or WebP image up to 5 MB, or a PDF up to 10 MB.";

function hasSafeFileName(name: string): boolean {
  return (
    name.length >= 1 &&
    name.length <= 120 &&
    name !== "." &&
    name !== ".." &&
    !/[\\/\u0000-\u001f\u007f]/.test(name)
  );
}

export function classifyCommunityAttachmentFile(file: File): {
  kind: CommunityAttachmentKind;
  mime: CommunityAttachmentMime;
} {
  const name = file.name.trim();
  const mime = file.type.trim().toLowerCase();
  if (!hasSafeFileName(name) || file.size <= 0) {
    throw new Error(ATTACHMENT_ERROR);
  }

  if (
    COMMUNITY_IMAGE_MIME_TYPES.includes(mime as CommunityImageMime) &&
    file.size <= COMMUNITY_IMAGE_MAX_BYTES &&
    /\.(?:jpe?g|png|webp)$/i.test(name)
  ) {
    return { kind: "image", mime: mime as CommunityImageMime };
  }

  if (
    mime === "application/pdf" &&
    file.size <= COMMUNITY_PDF_MAX_BYTES &&
    /\.pdf$/i.test(name)
  ) {
    return { kind: "file", mime: "application/pdf" };
  }

  throw new Error(ATTACHMENT_ERROR);
}

export async function sendCommunityAttachment(
  api: Pick<CommunityApi, "createAttachmentUpload" | "sendMessage">,
  groupId: string,
  file: File,
  caption = "",
  uploader: (uploadUrl: string, file: File) => Promise<void> =
    uploadCommunityAttachment,
): Promise<CommunityMessage> {
  const { kind, mime } = classifyCommunityAttachmentFile(file);
  const name = file.name.trim();
  const resolvedCaption = caption.trim();
  if (resolvedCaption.length > 500) {
    throw new Error("Caption must be 500 characters or fewer.");
  }

  const reservation = await api.createAttachmentUpload(groupId, {
    kind,
    name,
    mime,
    size: file.size,
  });
  await uploader(reservation.uploadUrl, file);

  const body = serializeCommunityAttachment(kind, {
    url: reservation.resourceUrl,
    name,
    mime,
    size: file.size,
    ...(resolvedCaption ? { caption: resolvedCaption } : {}),
  });

  return api.sendMessage(groupId, { kind, body });
}
