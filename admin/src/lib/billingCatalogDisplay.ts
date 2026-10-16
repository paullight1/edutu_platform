export function formatBillingTerm(product: {
  renewalMode: string;
  cadence: string;
  validityDays: number | null;
}): string {
  if (product.renewalMode === "one_time") {
    return product.validityDays == null
      ? "One-time"
      : `One-time · ${product.validityDays} days`;
  }

  if (product.renewalMode === "recurring") {
    const cadence = product.cadence.trim().toLowerCase();
    const label = cadence
      ? cadence.charAt(0).toUpperCase() + cadence.slice(1)
      : "Billing period not set";
    return `Recurring · ${label}`;
  }

  return product.renewalMode
    ? product.renewalMode.replace(/_/g, " ")
    : "Billing term not set";
}
