/** Convert Bachs decimal-string amounts to integer currency minor units. */
export function decimalToMinorUnits(value: string, currency: string): bigint {
  const normalizedCurrency = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Bachs currency is invalid");
  }
  const fractionDigits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizedCurrency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Bachs amount is invalid");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > fractionDigits) {
    throw new Error("Bachs amount has too many decimal places");
  }
  const scale = 10n ** BigInt(fractionDigits);
  const fractionValue = BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  return BigInt(whole) * scale + fractionValue;
}
