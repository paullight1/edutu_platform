import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { CreateSupportRequestDto } from "./support.dto";

// Where every contact-form / bug-report submission lands.
const SUPPORT_INBOX = "my.edutu@gmail.com";

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  /**
   * Emails a support request or bug report to the Edutu support inbox via the
   * Brevo transactional API, with the submitter set as reply-to so staff can
   * respond directly. Works for signed-out users — the email comes from the
   * body, not from an auth session.
   */
  async submit(dto: CreateSupportRequestDto) {
    const apiKey = process.env.BREVO_API_KEY;
    const subject =
      dto.type === "bug" ? `[Bug] ${dto.subject}` : `[Support] ${dto.subject}`;

    if (!apiKey) {
      // Missing config is a server problem, not the user's — log loudly and
      // signal unavailable so the client can offer the direct-email fallback.
      this.logger.error(
        `BREVO_API_KEY not configured — support ${dto.type} from ${dto.email} was NOT delivered. Subject: ${dto.subject}`,
      );
      throw new ServiceUnavailableException(
        "Support email is temporarily unavailable. Please email my.edutu@gmail.com directly.",
      );
    }

    const sender = {
      name: "Edutu Support",
      email: process.env.BREVO_SENDER_EMAIL || "no-reply@edutu.org",
    };
    const replyTo = dto.name?.trim()
      ? { email: dto.email.trim(), name: dto.name.trim() }
      : { email: dto.email.trim() };

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          to: [{ email: SUPPORT_INBOX, name: "Edutu Support" }],
          replyTo,
          subject,
          htmlContent: this.buildEmailHtml(dto),
        }),
      });

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        this.logger.error(`Brevo ${response.status}: ${detail}`);
        throw new BadGatewayException(
          "Could not send your message right now. Please try again shortly.",
        );
      }

      this.logger.log(
        `Support ${dto.type} delivered from ${dto.email} — "${dto.subject}"`,
      );
      return { ok: true };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        error instanceof Error ? error.message : "Brevo request failed",
      );
      throw new BadGatewayException(
        "Could not send your message right now. Please try again shortly.",
      );
    }
  }

  /** Branded HTML email listing the submission fields + the message body. */
  private buildEmailHtml(dto: CreateSupportRequestDto): string {
    const rows: Array<[string, string]> = [
      ["Type", dto.type === "bug" ? "Bug report" : "Support request"],
      ["Name", dto.name?.trim() || "—"],
      ["Email", dto.email.trim()],
      ["Subject", dto.subject.trim()],
    ];
    if (dto.context) {
      for (const [key, value] of Object.entries(dto.context)) {
        if (value && String(value).trim()) rows.push([key, String(value)]);
      }
    }

    const rowsHtml = rows
      .map(
        ([key, value]) =>
          `<tr><td style="padding:6px 14px 6px 0;font-size:13px;color:#6b7280;white-space:nowrap;vertical-align:top;">${this.escapeHtml(
            key,
          )}</td><td style="padding:6px 0;font-size:13px;color:#111827;">${this.escapeHtml(
            value,
          )}</td></tr>`,
      )
      .join("");

    const heading =
      dto.type === "bug" ? "New bug report" : "New support request";
    const body = this.escapeHtml(dto.message.trim()).replace(
      /\r?\n/g,
      "<br />",
    );

    return [
      "<div style=\"margin:0;padding:24px 12px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;\">",
      '<div style="max-width:560px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">',
      '<div style="background-color:#101828;padding:20px 28px;">',
      '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">edutu</span>',
      "</div>",
      '<div style="padding:28px;">',
      `<h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.3;color:#101828;">${heading}</h1>`,
      '<table style="border-collapse:collapse;margin:0 0 20px 0;">',
      rowsHtml,
      "</table>",
      `<p style="margin:0;font-size:15px;line-height:1.6;color:#374151;">${body}</p>`,
      "</div>",
      '<div style="padding:16px 28px;border-top:1px solid #e5e7eb;">',
      '<p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">',
      "Reply directly to this email to reach the person who submitted it.",
      "</p>",
      "</div>",
      "</div>",
      "</div>",
    ].join("");
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
