import Foundation

let fractional = parseRingExpiry("2026-10-31T10:15:30.123Z")
let wholeSeconds = parseRingExpiry("2026-10-31T10:15:30Z")
precondition(fractional != nil, "Backend timestamps with milliseconds must parse")
precondition(wholeSeconds != nil, "Whole-second timestamps must remain supported")
precondition(parseRingExpiry("not-a-date") == nil, "Malformed timestamps must not parse")
precondition(fractional!.timeIntervalSince(wholeSeconds!) > 0.12)
print("Ring expiry parsing passed")
