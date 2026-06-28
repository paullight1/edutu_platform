import { BadRequestException } from "@nestjs/common";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";

const OBVIOUS_LOCAL_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
]);

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isObviousLocalHostname(hostname: string): boolean {
  return (
    OBVIOUS_LOCAL_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  );
}

function ipv4ToInt(address: string): number | null {
  const octets = address.split(".");
  if (octets.length !== 4) return null;

  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const parsed = Number(octet);
    if (parsed < 0 || parsed > 255) return null;
    value = (value << 8) | parsed;
  }

  return value >>> 0;
}

function ipv6ToBigInt(address: string): bigint | null {
  if (address.includes("%")) return null;

  const lower = address.toLowerCase();
  const parts = lower.split("::");
  if (parts.length > 2) return null;

  const parseSection = (section: string): number[] | null => {
    if (!section) return [];

    const values: number[] = [];
    const hextets = section.split(":");

    for (let i = 0; i < hextets.length; i += 1) {
      const hextet = hextets[i];
      if (!hextet) return null;

      if (hextet.includes(".")) {
        if (i !== hextets.length - 1) return null;
        const ipv4 = ipv4ToInt(hextet);
        if (ipv4 === null) return null;
        values.push((ipv4 >>> 16) & 0xffff, ipv4 & 0xffff);
        continue;
      }

      if (!/^[0-9a-f]{1,4}$/.test(hextet)) return null;
      values.push(Number.parseInt(hextet, 16));
    }

    return values;
  };

  const left = parseSection(parts[0]);
  const right = parts.length === 2 ? parseSection(parts[1]) : [];
  if (!left || !right) return null;

  const hasCompression = parts.length === 2;
  const zerosToInsert = hasCompression ? 8 - left.length - right.length : 0;
  if ((!hasCompression && left.length !== 8) || zerosToInsert < 0) return null;

  const hextets = hasCompression
    ? [...left, ...Array.from({ length: zerosToInsert }, () => 0), ...right]
    : left;

  if (hextets.length !== 8) return null;

  let value = 0n;
  for (const hextet of hextets) {
    value = (value << 16n) | BigInt(hextet);
  }
  return value;
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4ToInt(address);
  if (value === null) return true;

  const inRange = (start: number, mask: number) => ((value & mask) >>> 0) === start;
  return (
    inRange(0x00000000, 0xff000000) || // 0.0.0.0/8
    inRange(0x0a000000, 0xff000000) || // 10.0.0.0/8
    inRange(0x64400000, 0xffc00000) || // 100.64.0.0/10
    inRange(0x7f000000, 0xff000000) || // 127.0.0.0/8
    inRange(0xa9fe0000, 0xffff0000) || // 169.254.0.0/16
    inRange(0xac100000, 0xfff00000) || // 172.16.0.0/12
    inRange(0xc0000000, 0xffffff00) || // 192.0.0.0/24
    inRange(0xc0000200, 0xffffff00) || // 192.0.2.0/24
    inRange(0xc0586300, 0xffffff00) || // 192.88.99.0/24
    inRange(0xc0a80000, 0xffff0000) || // 192.168.0.0/16
    inRange(0xc6120000, 0xfffe0000) || // 198.18.0.0/15
    inRange(0xc6336400, 0xffffff00) || // 198.51.100.0/24
    inRange(0xcb007100, 0xffffff00) || // 203.0.113.0/24
    inRange(0xe0000000, 0xf0000000) || // 224.0.0.0/4
    inRange(0xf0000000, 0xf0000000) || // 240.0.0.0/4
    value === 0xffffffff
  );
}

function isPrivateIpv6(address: string): boolean {
  const value = ipv6ToBigInt(address);
  if (value === null) return true;

  if (value === 0n || value === 1n) return true; // :: and ::1
  if ((value >> 121n) === 0b1111110n) return true; // fc00::/7
  if ((value >> 118n) === 0b1111111010n) return true; // fe80::/10
  if ((value >> 120n) === 0xffn) return true; // ff00::/8
  if ((value >> 96n) === 0x20010db8n) return true; // 2001:db8::/32

  // IPv4-mapped IPv6 addresses.
  if ((value >> 32n) === 0xffffn) {
    const embeddedIpv4 = Number(value & 0xffffffffn);
    const octets = [
      (embeddedIpv4 >>> 24) & 0xff,
      (embeddedIpv4 >>> 16) & 0xff,
      (embeddedIpv4 >>> 8) & 0xff,
      embeddedIpv4 & 0xff,
    ].join(".");
    return isPrivateIpv4(octets);
  }

  return false;
}

export function isPublicIpAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !isPrivateIpv4(address);
  if (family === 6) return !isPrivateIpv6(address);
  return false;
}

export function assertSafeHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException("URL must be an absolute HTTP or HTTPS URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestException("URL must use http or https");
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    throw new BadRequestException("URL must include a hostname");
  }

  if (isObviousLocalHostname(hostname)) {
    throw new BadRequestException(`Blocked local hostname: ${hostname}`);
  }

  if (net.isIP(hostname) && !isPublicIpAddress(hostname)) {
    throw new BadRequestException(`Blocked private or local IP address: ${hostname}`);
  }

  return parsed;
}

export async function resolvePublicAddress(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }> {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) {
    throw new BadRequestException("URL must include a hostname");
  }

  if (isObviousLocalHostname(normalizedHostname)) {
    throw new BadRequestException(`Blocked local hostname: ${normalizedHostname}`);
  }

  const family = net.isIP(normalizedHostname);
  if (family === 4 || family === 6) {
    if (!isPublicIpAddress(normalizedHostname)) {
      throw new BadRequestException(
        `Blocked private or local IP address: ${normalizedHostname}`,
      );
    }

    return { address: normalizedHostname, family: family as 4 | 6 };
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = (await dnsLookup(normalizedHostname, { all: true, verbatim: true })) as Array<{
      address: string;
      family: number;
    }>;
  } catch {
    throw new BadRequestException(`Unable to resolve a public address for ${normalizedHostname}`);
  }

  const safeRecord = records.find((record) => isPublicIpAddress(record.address));
  if (!safeRecord) {
    throw new BadRequestException(
      `Host resolves only to private or local addresses: ${normalizedHostname}`,
    );
  }

  return {
    address: safeRecord.address,
    family: safeRecord.family as 4 | 6,
  };
}
