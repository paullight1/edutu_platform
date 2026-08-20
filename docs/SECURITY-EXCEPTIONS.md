# Security Exceptions

Security exceptions are temporary, explicit, narrowly scoped, and must never hide a critical vulnerability. CI should fail for every high/critical dependency finding unless it matches an exception documented here and enforced by a repository-owned checker.

## Expo SDK 56 / Metro `image-size` chain

**Recorded:** 2026-08-20  
**Scope:** `edutumobile` development/build toolchain only  
**Root package:** `image-size`  
**Severity:** high  
**Known advisories:** ICNS parser infinite-loop denial of service; JXL/HEIF parser infinite-loop denial of service.

The current Expo SDK 56 Metro dependency graph resolves to an affected `image-size` release. As of this hardening pass, `npm audit fix --force` proposes resolving the finding by downgrading the application from Expo 56 to Expo 53.0.27. That is a framework-level breaking downgrade and is not an acceptable unattended security fix.

The temporary CI exception is limited to the high-severity dependency nodes that npm reports as part of this exact Expo/Metro `image-size` chain:

- `image-size`
- `metro`
- `@expo/metro`
- `@expo/cli`
- `@expo/metro-config`
- `metro-config`
- `metro-transform-worker`
- `expo`
- `@config-plugins/react-native-webrtc`

The exception activates only when `image-size` itself is present at **high** severity. A critical severity in any package, any unrelated high-severity package, or any allowlisted package appearing high without the `image-size` root causes CI to fail.

### Exposure and mitigation

This chain is used by the local/mobile build and bundling toolchain rather than by Edutu's server-side request path. Repository-controlled assets remain trusted inputs during builds. This reduces exposure but does not make the advisory irrelevant.

### Removal criteria

Remove this exception as soon as the Expo 56-compatible dependency graph ships a fixed `image-size` chain, or as part of a tested forward Expo SDK upgrade that removes the vulnerable dependency. Do not expand the allowlist to accommodate unrelated findings; fix those dependencies instead.

## No critical exceptions

Critical dependency vulnerabilities are never allowlisted by the repository security policy.
