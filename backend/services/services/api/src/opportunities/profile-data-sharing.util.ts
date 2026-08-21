function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Whether profile/preferences/memory text may be sent to an external embedding
 * provider. Consent is fail-closed: a missing setting, malformed setting or
 * string-ish truthy value is not permission.
 */
export function allowsExternalProfileEmbedding(profile: unknown): boolean {
  const settings = asRecord(asRecord(profile).settings);
  const privacy = asRecord(settings.privacy);

  return privacy.dataSharing === true || privacy.data_sharing === true;
}
