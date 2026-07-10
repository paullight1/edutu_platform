import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import type { CVDataDto } from "./dto/cv-ai.dto";

/** An uploaded LinkedIn export file (from multer memory storage). */
export interface ExportUploadFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

/**
 * Normalised LinkedIn profile, provider-agnostic. Every field is optional —
 * different providers (and the public fallback) return different subsets.
 */
export interface LinkedInProfile {
  full_name?: string;
  headline?: string;
  summary?: string;
  location?: string;
  email?: string;
  profile_url?: string;
  experiences: Array<{
    company?: string;
    title?: string;
    description?: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    current?: boolean;
  }>;
  education: Array<{
    school?: string;
    degree?: string;
    field?: string;
    start_date?: string;
    end_date?: string;
  }>;
  skills: string[];
  projects: Array<{ name?: string; description?: string; url?: string }>;
  achievements: Array<{ title?: string; issuer?: string; date?: string }>;
  /** which strategy produced this profile */
  source: "proxycurl" | "scrapingbee" | "public" | "export-zip" | "export-pdf";
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};

type PCDate = { day?: number; month?: number; year?: number } | null | undefined;

@Injectable()
export class LinkedInImportService {
  private readonly logger = new Logger(LinkedInImportService.name);

  /** A profile URL looks like https://www.linkedin.com/in/<slug>. */
  isProfileUrl(url?: string | null): boolean {
    if (!url) return false;
    return /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[^/?#\s]+/i.test(
      url.trim(),
    );
  }

  /** Trim, force https, and drop tracking query/params. */
  normalizeUrl(url: string): string {
    let clean = url.trim().replace(/\s+/g, "");
    if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
    clean = clean.replace(/^http:\/\//i, "https://");
    // Keep only the /in/<slug> path, drop query + trailing slash noise.
    const match = clean.match(
      /^(https:\/\/(?:[a-z0-9-]+\.)?linkedin\.com\/in\/[^/?#\s]+)/i,
    );
    return match ? match[1] : clean.split(/[?#]/)[0];
  }

  /**
   * Import a public LinkedIn profile into a normalised structure. Tries the
   * configured provider first (best data), then a rendered-HTML provider, then
   * a best-effort public fetch. Returns null when nothing usable is found so
   * the caller can fall back to profile/goal context.
   */
  async import(rawUrl?: string | null): Promise<LinkedInProfile | null> {
    if (!this.isProfileUrl(rawUrl)) return null;
    const url = this.normalizeUrl(rawUrl!.trim());

    const strategies: Array<() => Promise<LinkedInProfile | null>> = [
      () => this.viaProxycurl(url),
      () => this.viaScrapingBee(url),
      () => this.viaPublicFetch(url),
    ];

    for (const strategy of strategies) {
      try {
        const profile = await strategy();
        if (profile && this.hasContent(profile)) return profile;
      } catch (error) {
        this.logger.warn(
          `LinkedIn import strategy failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return null;
  }

  private hasContent(p: LinkedInProfile): boolean {
    return Boolean(
      p.full_name ||
        p.headline ||
        p.summary ||
        p.experiences.length ||
        p.education.length ||
        p.skills.length,
    );
  }

  // ─── First-party export upload (no third party) ───────────────────────────

  /**
   * Parse a LinkedIn export the user uploaded themselves — either the
   * "Get a copy of your data" ZIP (structured CSVs, best) or the "Save to PDF"
   * profile export (best-effort). 100% first-party: it's the user's own data.
   */
  async fromExport(file: ExportUploadFile): Promise<LinkedInProfile | null> {
    if (!file?.buffer?.length) return null;
    const name = (file.originalname || "").toLowerCase();
    const type = (file.mimetype || "").toLowerCase();
    const buf = file.buffer;

    const looksZip =
      name.endsWith(".zip") ||
      type.includes("zip") ||
      (buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b); // "PK"
    const looksPdf =
      name.endsWith(".pdf") ||
      type.includes("pdf") ||
      buf.subarray(0, 5).toString("latin1") === "%PDF-";

    try {
      if (looksZip) return this.fromZip(buf);
      if (looksPdf) return await this.fromPdf(buf);
    } catch (error) {
      this.logger.warn(
        `LinkedIn export parse failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
    return null;
  }

  /** Parse the "Get a copy of your data" ZIP (Profile/Positions/Education/... CSVs). */
  private fromZip(buffer: Buffer): LinkedInProfile | null {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const readCsv = (keyword: string): Record<string, string>[] => {
      const entry = entries.find(
        (e) =>
          !e.isDirectory &&
          /\.csv$/i.test(e.entryName) &&
          e.entryName.toLowerCase().includes(keyword),
      );
      if (!entry) return [];
      try {
        return this.parseCsv(entry.getData().toString("utf8"));
      } catch {
        return [];
      }
    };

    const profile = readCsv("profile")[0] || {};
    const positions = readCsv("positions");
    const education = readCsv("education");
    const skills = readCsv("skills");
    const projects = readCsv("projects");
    const certs = readCsv("certification");
    const emails = readCsv("email address");

    const primaryEmail =
      emails.find((r) => /^y(es)?$/i.test(this.pick(r, "Primary")))?.[
        this.emailKey(emails)
      ] || (emails[0] ? emails[0][this.emailKey(emails)] : "");

    const result: LinkedInProfile = {
      source: "export-zip",
      full_name:
        [this.pick(profile, "First Name"), this.pick(profile, "Last Name")]
          .filter(Boolean)
          .join(" ") || undefined,
      headline: this.pick(profile, "Headline") || undefined,
      summary: this.pick(profile, "Summary") || undefined,
      location:
        this.pick(profile, "Geo Location", "Location", "Address") || undefined,
      email: primaryEmail || undefined,
      experiences: positions.map((r) => ({
        company: this.pick(r, "Company Name") || undefined,
        title: this.pick(r, "Title") || undefined,
        description: this.pick(r, "Description") || undefined,
        location: this.pick(r, "Location") || undefined,
        start_date: this.pick(r, "Started On") || undefined,
        end_date: this.pick(r, "Finished On") || undefined,
        current: !this.pick(r, "Finished On"),
      })),
      education: education.map((r) => ({
        school: this.pick(r, "School Name") || undefined,
        degree: this.pick(r, "Degree Name") || undefined,
        field: this.pick(r, "Notes") || undefined,
        start_date: this.pick(r, "Start Date") || undefined,
        end_date: this.pick(r, "End Date") || undefined,
      })),
      skills: this.unique(skills.map((r) => this.pick(r, "Name"))),
      projects: projects.map((r) => ({
        name: this.pick(r, "Title") || undefined,
        description: this.pick(r, "Description") || undefined,
        url: this.pick(r, "Url", "URL") || undefined,
      })),
      achievements: certs.map((r) => ({
        title: this.pick(r, "Name") || undefined,
        issuer: this.pick(r, "Authority") || undefined,
        date: this.pick(r, "Started On", "Start Date") || undefined,
      })),
    };

    return this.hasContent(result) ? result : null;
  }

  /** Best-effort parse of the "Save to PDF" profile export. */
  private async fromPdf(buffer: Buffer): Promise<LinkedInProfile | null> {
    // Lazy import: pdf-parse bundles pdfjs, whose module-eval touches newer
    // Node built-ins and can crash on older runtimes. Loading it only when a
    // PDF is actually uploaded keeps app startup independent of Node version.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let text = "";
    try {
      const result = await parser.getText();
      text = result?.text || "";
    } finally {
      await parser.destroy().catch(() => undefined);
    }

    const lines = text
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const profile: LinkedInProfile = {
      source: "export-pdf",
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      achievements: [],
    };

    // Name = first line; headline = the next non-section line.
    profile.full_name = lines[0];
    if (lines[1] && !this.pdfSectionKey(lines[1])) profile.headline = lines[1];

    // Bucket remaining lines under recognised section headers.
    const buckets: Record<string, string[]> = {};
    let current = "header";
    for (const line of lines) {
      const key = this.pdfSectionKey(line);
      if (key) {
        current = key;
        continue;
      }
      (buckets[current] ||= []).push(line);
    }

    if (buckets.summary?.length) profile.summary = buckets.summary.join(" ");
    if (buckets.skills?.length) {
      profile.skills = this.unique(
        buckets.skills.flatMap((l) => l.split(/[,•|·]/)).map((s) => s.trim()),
      );
    }
    profile.experiences = this.pdfBlocksToEntries(buckets.experience || []).map(
      (b) => ({
        title: b[0],
        company: b[1],
        start_date: b.date,
        end_date: b.endDate,
        description: b.rest || undefined,
        current: /present/i.test(b.date || ""),
      }),
    );
    profile.education = this.pdfBlocksToEntries(buckets.education || []).map(
      (b) => ({ school: b[0], degree: b[1], start_date: b.date, end_date: b.endDate }),
    );

    return this.hasContent(profile) ? profile : null;
  }

  /**
   * Group a section's lines into entries by treating a date-range line as the
   * boundary marker. Returns {0:firstLine,1:secondLine,date,endDate,rest}.
   */
  private pdfBlocksToEntries(
    section: string[],
  ): Array<{ 0?: string; 1?: string; date?: string; endDate?: string; rest?: string }> {
    const dateRange =
      /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?((19|20)\d{2})\s*[-–—to]+\s*(present|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*)?((19|20)\d{2}))/i;
    const entries: Array<{
      0?: string;
      1?: string;
      date?: string;
      endDate?: string;
      rest?: string;
    }> = [];
    let buf: string[] = [];
    const flush = () => {
      if (!buf.length) return;
      const dateIdx = buf.findIndex((l) => dateRange.test(l));
      const dateLine = dateIdx >= 0 ? buf[dateIdx] : "";
      const [start, end] = dateLine
        ? dateLine.split(/\s*[-–—]|\s+to\s+/i).map((s) => s.trim())
        : ["", ""];
      const meaningful = buf.filter((_, i) => i !== dateIdx);
      entries.push({
        0: meaningful[0],
        1: meaningful[1],
        date: start || undefined,
        endDate: end || undefined,
        rest: meaningful.slice(2).join(" ") || undefined,
      });
      buf = [];
    };
    for (const line of section) {
      buf.push(line);
      if (dateRange.test(line)) flush();
    }
    flush();
    return entries.filter((e) => e[0]);
  }

  private pdfSectionKey(line: string): string | null {
    const l = line.toLowerCase().replace(/&/g, "").replace(/\s+/g, " ").trim();
    if (/^(summary|about)$/.test(l)) return "summary";
    if (/^experience$/.test(l)) return "experience";
    if (/^education$/.test(l)) return "education";
    if (/^(skills|top skills)$/.test(l)) return "skills";
    if (/^projects$/.test(l)) return "projects";
    if (/^(licenses certifications|certifications|licenses)$/.test(l))
      return "certifications";
    if (/^(honors awards|honors|awards)$/.test(l)) return "achievements";
    if (/^(contact|languages|interests|recommendations|volunteering)$/.test(l))
      return "ignore";
    return null;
  }

  /** RFC4180-ish CSV parser: handles quoted fields with embedded commas/newlines. */
  private parseCsv(input: string): Record<string, string>[] {
    const text = input.replace(/^﻿/, "");
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c !== "\r") {
        field += c;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    if (!rows.length) return [];

    const headers = rows[0].map((h) => h.trim());
    return rows
      .slice(1)
      .filter((r) => r.some((v) => v.trim()))
      .map((r) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => {
          obj[h] = (r[idx] || "").trim();
        });
        return obj;
      });
  }

  /** Case-insensitive column lookup across candidate header names. */
  private pick(row: Record<string, string>, ...keys: string[]): string {
    for (const key of keys) {
      const found = Object.keys(row).find(
        (k) => k.toLowerCase() === key.toLowerCase(),
      );
      if (found && row[found]) return row[found];
    }
    return "";
  }

  private emailKey(emails: Record<string, string>[]): string {
    const sample = emails[0] || {};
    return (
      Object.keys(sample).find((k) => k.toLowerCase().includes("email")) ||
      "Email Address"
    );
  }

  // ─── Proxycurl (structured, most reliable) ────────────────────────────────
  private async viaProxycurl(url: string): Promise<LinkedInProfile | null> {
    const key = process.env.PROXYCURL_API_KEY;
    if (!key) return null;

    const res = await axios.get(
      "https://nubela.co/proxycurl/api/v2/linkedin",
      {
        params: {
          url,
          skills: "include",
          use_cache: "if-present",
          fallback_to_cache: "on-error",
        },
        headers: { Authorization: `Bearer ${key}` },
        timeout: 30_000,
        validateStatus: (s) => s < 500,
      },
    );

    if (res.status >= 400 || !res.data || typeof res.data !== "object") {
      this.logger.warn(`Proxycurl returned ${res.status} for ${url}`);
      return null;
    }

    const d = res.data as Record<string, any>;
    return {
      source: "proxycurl",
      profile_url: url,
      full_name:
        d.full_name ||
        [d.first_name, d.last_name].filter(Boolean).join(" ") ||
        undefined,
      headline: d.headline || d.occupation || undefined,
      summary: d.summary || undefined,
      location:
        [d.city, d.state, d.country_full_name || d.country]
          .filter(Boolean)
          .join(", ") || undefined,
      email:
        Array.isArray(d.personal_emails) && d.personal_emails.length
          ? d.personal_emails[0]
          : undefined,
      experiences: (Array.isArray(d.experiences) ? d.experiences : []).map(
        (e: any) => ({
          company: e.company || undefined,
          title: e.title || undefined,
          description: e.description || undefined,
          location: e.location || undefined,
          start_date: this.pcDate(e.starts_at),
          end_date: this.pcDate(e.ends_at),
          current: !e.ends_at,
        }),
      ),
      education: (Array.isArray(d.education) ? d.education : []).map(
        (e: any) => ({
          school: e.school || undefined,
          degree: e.degree_name || undefined,
          field: e.field_of_study || undefined,
          start_date: this.pcDate(e.starts_at),
          end_date: this.pcDate(e.ends_at),
        }),
      ),
      skills: this.unique(Array.isArray(d.skills) ? d.skills : []),
      projects: (Array.isArray(d.accomplishment_projects)
        ? d.accomplishment_projects
        : []
      ).map((p: any) => ({
        name: p.title || undefined,
        description: p.description || undefined,
        url: p.url || undefined,
      })),
      achievements: [
        ...(Array.isArray(d.certifications) ? d.certifications : []).map(
          (c: any) => ({
            title: c.name || undefined,
            issuer: c.authority || undefined,
            date: this.pcDate(c.starts_at),
          }),
        ),
        ...(Array.isArray(d.honour_awards)
          ? d.honour_awards
          : Array.isArray(d.honor_awards)
            ? d.honor_awards
            : []
        ).map((a: any) => ({
          title: a.title || undefined,
          issuer: a.issuer || undefined,
          date: this.pcDate(a.issued_on),
        })),
      ],
    };
  }

  // ─── ScrapingBee (renders JS, then we parse the HTML) ─────────────────────
  private async viaScrapingBee(url: string): Promise<LinkedInProfile | null> {
    const key = process.env.SCRAPINGBEE_API_KEY;
    if (!key) return null;

    const res = await axios.get("https://app.scrapingbee.com/api/v1", {
      params: { api_key: key, url, render_js: "true", block_ads: "true" },
      timeout: 45_000,
      validateStatus: (s) => s < 500,
    });
    if (res.status >= 400 || typeof res.data !== "string") return null;
    return this.parseHtml(res.data, url, "scrapingbee");
  }

  // ─── Public fetch (best-effort — LinkedIn often gates this) ───────────────
  private async viaPublicFetch(url: string): Promise<LinkedInProfile | null> {
    const res = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15_000,
      maxRedirects: 3,
      validateStatus: (s) => s < 500,
    });
    if (res.status >= 400 || typeof res.data !== "string") return null;
    return this.parseHtml(res.data, url, "public");
  }

  /**
   * Extract whatever we can from a LinkedIn profile HTML page: the embedded
   * JSON-LD Person graph (richest) and OpenGraph meta tags (name + headline).
   */
  private parseHtml(
    html: string,
    url: string,
    source: "scrapingbee" | "public",
  ): LinkedInProfile | null {
    const $ = cheerio.load(html);
    const profile: LinkedInProfile = {
      source,
      profile_url: url,
      experiences: [],
      education: [],
      skills: [],
      projects: [],
      achievements: [],
    };

    // OpenGraph fallback: "<Name> - <Headline> | LinkedIn"
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      const [name, ...rest] = ogTitle.split(/\s[-–|]\s/);
      if (name) profile.full_name = name.trim();
      const headline = rest.join(" - ").replace(/\|?\s*LinkedIn\s*$/i, "").trim();
      if (headline) profile.headline = headline;
    }
    const ogDesc = $('meta[property="og:description"]').attr("content");
    if (ogDesc && !profile.summary) profile.summary = ogDesc.trim();

    // JSON-LD Person graph — richest public source.
    $('script[type="application/ld+json"]').each((_, el) => {
      const raw = $(el).contents().text();
      if (!raw) return;
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        return;
      }
      const nodes: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.["@graph"])
          ? json["@graph"]
          : [json];
      const person = nodes.find(
        (n) => n && (n["@type"] === "Person" || n.givenName || n.name),
      );
      if (!person) return;

      if (person.name && !profile.full_name) profile.full_name = person.name;
      if (person.jobTitle && !profile.headline) {
        profile.headline = Array.isArray(person.jobTitle)
          ? person.jobTitle[0]
          : person.jobTitle;
      }
      if (person.description && !profile.summary) {
        profile.summary = person.description;
      }
      if (person.address) {
        const a = person.address;
        profile.location =
          profile.location ||
          [a.addressLocality, a.addressRegion, a.addressCountry]
            .filter(Boolean)
            .join(", ") ||
          undefined;
      }
      const works = Array.isArray(person.worksFor)
        ? person.worksFor
        : person.worksFor
          ? [person.worksFor]
          : [];
      for (const w of works) {
        if (w?.name) profile.experiences.push({ company: w.name });
      }
      const alumni = Array.isArray(person.alumniOf)
        ? person.alumniOf
        : person.alumniOf
          ? [person.alumniOf]
          : [];
      for (const s of alumni) {
        if (s?.name) profile.education.push({ school: s.name });
      }
      if (Array.isArray(person.knowsAbout)) {
        profile.skills = this.unique([
          ...profile.skills,
          ...person.knowsAbout.filter((x: unknown) => typeof x === "string"),
        ]);
      }
    });

    return this.hasContent(profile) ? profile : null;
  }

  // ─── Mapping helpers ──────────────────────────────────────────────────────

  /** Merge an imported profile into an (optional) existing CV, without clobbering user edits. */
  toCVData(profile: LinkedInProfile, existing?: CVDataDto): CVDataDto {
    const header = {
      full_name: existing?.header?.full_name || profile.full_name || "",
      email: existing?.header?.email || profile.email || "",
      phone: existing?.header?.phone || "",
      location: existing?.header?.location || profile.location || "",
      linkedin: existing?.header?.linkedin || profile.profile_url || "",
      portfolio: existing?.header?.portfolio || "",
      website: existing?.header?.website || "",
    };

    return {
      header,
      summary: existing?.summary || profile.summary || profile.headline || "",
      experience: existing?.experience?.length
        ? existing.experience
        : profile.experiences.map((e, i) => ({
            id: `exp-${i + 1}`,
            company: e.company || "",
            role: e.title || "",
            description: e.description || "",
            location: e.location || "",
            start_date: e.start_date || "",
            end_date: e.end_date || "",
            current: Boolean(e.current),
            highlights: [],
          })),
      education: existing?.education?.length
        ? existing.education
        : profile.education.map((e, i) => ({
            id: `edu-${i + 1}`,
            institution: e.school || "",
            degree: e.degree || "",
            field: e.field || "",
            start_date: e.start_date || "",
            end_date: e.end_date || "",
            highlights: [],
          })),
      skills: this.unique([...(existing?.skills || []), ...profile.skills]),
      projects: existing?.projects?.length
        ? existing.projects
        : profile.projects.map((p, i) => ({
            id: `proj-${i + 1}`,
            name: p.name || "",
            description: p.description || "",
            url: p.url || "",
            technologies: [],
          })),
      achievements: existing?.achievements?.length
        ? existing.achievements
        : profile.achievements.map((a, i) => ({
            id: `ach-${i + 1}`,
            title: a.title || "",
            issuer: a.issuer || "",
            date: a.date || "",
            description: "",
          })),
    };
  }

  /** Compact JSON the LLM can ground on (verified source-of-truth data). */
  buildPromptContext(profile: LinkedInProfile): string {
    return JSON.stringify(
      {
        full_name: profile.full_name,
        headline: profile.headline,
        summary: profile.summary,
        location: profile.location,
        experiences: profile.experiences,
        education: profile.education,
        skills: profile.skills,
        projects: profile.projects,
        achievements: profile.achievements,
        source: profile.source,
      },
      null,
      2,
    );
  }

  private pcDate(date: PCDate): string {
    if (!date || !date.year) return "";
    const month = date.month ? String(date.month).padStart(2, "0") : "01";
    return `${date.year}-${month}`;
  }

  private unique(values: Array<string | null | undefined>): string[] {
    return Array.from(
      new Set(values.map((v) => String(v || "").trim()).filter(Boolean)),
    );
  }
}
