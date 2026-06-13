import type { PackageTemplate } from './packageService';

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const textEncoder = new TextEncoder();

function sanitizeFileName(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'download';
}

export function getTemplateExtension(fileType: string): string {
  const normalized = fileType.trim().toLowerCase();
  if (normalized.includes('markdown') || normalized.includes('md')) return 'md';
  if (normalized.includes('text') || normalized.includes('txt')) return 'txt';
  if (normalized.includes('pdf')) return 'pdf';
  if (normalized.includes('docx')) return 'docx';
  if (normalized.includes('doc')) return 'doc';
  if (normalized.includes('html')) return 'html';
  return 'txt';
}

export function getTemplateMimeType(fileType: string): string {
  const normalized = fileType.trim().toLowerCase();
  if (normalized.includes('markdown') || normalized.includes('md')) return 'text/markdown;charset=utf-8';
  if (normalized.includes('html')) return 'text/html;charset=utf-8';
  if (normalized.includes('json')) return 'application/json;charset=utf-8';
  if (normalized.includes('pdf')) return 'application/pdf';
  if (normalized.includes('docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (normalized.includes('doc')) return 'application/msword';
  return 'text/plain;charset=utf-8';
}

export function getTemplateDownloadFileName(template: Pick<PackageTemplate, 'title' | 'fileType'>): string {
  const baseName = sanitizeFileName(template.title);
  const extension = getTemplateExtension(template.fileType);
  return `${baseName}.${extension}`;
}

export function getPackageBundleFileName(packageTitle: string): string {
  return `${sanitizeFileName(packageTitle)}_templates.zip`;
}

export function createDataUrl(content: string, mimeType: string): string {
  return `data:${mimeType},${encodeURIComponent(content)}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function makeZipBlob(entries: ZipEntry[]): Blob {
  const { dosDate, dosTime } = toDosDateTime();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = textEncoder.encode(entry.name);
    const crc = crc32(entry.data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, dosTime, true);
    centralView.setUint16(14, dosDate, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + entry.data.length;
  }

  const centralDirectorySize = centralChunks.reduce((size, chunk) => size + chunk.length, 0);
  const centralDirectoryOffset = localOffset;
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralDirectorySize, true);
  endView.setUint32(16, centralDirectoryOffset, true);
  endView.setUint16(20, 0, true);

  const blobParts = [...localChunks, ...centralChunks, endRecord] as BlobPart[];

  return new Blob(blobParts, {
    type: 'application/zip'
  });
}

async function blobFromDataUrl(url: string): Promise<Blob | null> {
  const commaIndex = url.indexOf(',');
  if (!url.startsWith('data:') || commaIndex === -1) {
    return null;
  }

  const meta = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  const mimeType = meta.split(';')[0] || 'text/plain;charset=utf-8';

  if (/;base64/i.test(meta)) {
    const binary = globalThis.atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(payload)], { type: mimeType });
}

export async function downloadPackageTemplate(template: PackageTemplate): Promise<{ blob: Blob; fileName: string } | null> {
  const fileName = getTemplateDownloadFileName(template);

  if (template.content) {
    return {
      blob: new Blob([template.content], { type: getTemplateMimeType(template.fileType) }),
      fileName
    };
  }

  if (!template.fileUrl) {
    return null;
  }

  if (template.fileUrl.startsWith('data:')) {
    const blob = await blobFromDataUrl(template.fileUrl);
    return blob ? { blob, fileName } : null;
  }

  const response = await fetch(template.fileUrl);
  if (!response.ok) {
    return null;
  }

  return {
    blob: await response.blob(),
    fileName
  };
}

export async function buildPackageTemplateZip(templates: PackageTemplate[]): Promise<Blob | null> {
  const entries: ZipEntry[] = [];

  for (const template of templates) {
    const download = await downloadPackageTemplate(template);
    if (!download) {
      continue;
    }

    entries.push({
      name: download.fileName,
      data: new Uint8Array(await download.blob.arrayBuffer())
    });
  }

  if (entries.length === 0) {
    return null;
  }

  return makeZipBlob(entries);
}
