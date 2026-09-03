import type { EligibilityProfile } from "./eligibility.util";

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value >= 0 && value < 150 ? value : undefined;
}

function ageAt(dateOfBirth: string | undefined, now: Date): number | undefined {
  if (!dateOfBirth) return undefined;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) {
    return undefined;
  }

  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - born.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }

  return age >= 0 && age < 150 ? age : undefined;
}

function firstEducationDegree(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") {
        const degree = textValue((item as Record<string, unknown>).degree);
        if (degree) return degree;
      }
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    return textValue((value as Record<string, unknown>).degree);
  }

  return undefined;
}

export function toEligibilityProfile(
  profile: unknown,
  now: Date = new Date(),
): EligibilityProfile {
  const value =
    profile && typeof profile === "object" && !Array.isArray(profile)
      ? (profile as Record<string, unknown>)
      : {};
  const location =
    value.location &&
    typeof value.location === "object" &&
    !Array.isArray(value.location)
      ? (value.location as Record<string, unknown>)
      : {};

  const dateOfBirth = textValue(
    value.dateOfBirth ?? value.date_of_birth,
  );
  const explicitAge = numberValue(value.age);

  return {
    country: textValue(value.country) ?? textValue(location.country),
    age: explicitAge ?? ageAt(dateOfBirth, now),
    degree:
      textValue(value.degree) ?? firstEducationDegree(value.education),
  };
}
