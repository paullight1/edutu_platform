import { Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

@Injectable()
export class AiEncryptionService {
  private getKey() {
    const secret =
      process.env.AI_KEY_ENCRYPTION_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CLERK_SECRET_KEY;

    if (!secret) {
      throw new Error(
        "AI_KEY_ENCRYPTION_SECRET is required to store AI provider keys",
      );
    }

    return createHash("sha256").update(secret).digest();
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  decrypt(payload: string) {
    const [ivBase64, tagBase64, encryptedBase64] = payload.split(":");
    if (!ivBase64 || !tagBase64 || !encryptedBase64) {
      throw new Error("Invalid encrypted key payload");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.getKey(),
      Buffer.from(ivBase64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedBase64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  preview(value: string) {
    const trimmed = value.trim();
    if (trimmed.length <= 8) return "****";
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
  }
}
