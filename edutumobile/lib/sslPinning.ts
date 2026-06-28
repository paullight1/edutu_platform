/**
 * SSL Certificate Pinning — Foundation
 *
 * Production-level SSL pinning prevents man-in-the-middle attacks by
 * verifying that the server's TLS certificate matches a known public key.
 *
 * IMPLEMENTATION GUIDE:
 *
 * iOS (TrustKit):
 *   Install: npx expo install react-native-ssl-pinning
 *   Configure in Info.plist:
 *     <key>TSKConfiguration</key>
 *     <dict>
 *       <key>TSKSwizzleNetworkDelegates</key>
 *       <true/>
 *       <key>TSKPinnedDomains</key>
 *       <dict>
 *         <key>api.edutu.org</key>
 *         <dict>
 *           <key>TSKPublicKeyHashes</key>
 *           <array>
 *             <string>AAAA...base64-SHA256-hash=</string>
 *           </array>
 *           <key>TSKEnforcePinning</key>
 *           <true/>
 *         </dict>
 *       </dict>
 *     </dict>
 *
 * Android (Network Security Config):
 *   Create android/app/src/main/res/xml/network_security_config.xml:
 *     <network-security-config>
 *       <domain-config>
 *         <domain includeSubdomains="true">edutu.org</domain>
 *         <pin-set>
 *           <pin digest="SHA-256">AAAA...base64-hash=</pin>
 *         </pin-set>
 *       </domain-config>
 *     </network-security-config>
 *
 *   Reference in AndroidManifest.xml:
 *     android:networkSecurityConfig="@xml/network_security_config"
 *
 * HOW TO GET PIN HASHES:
 *   openssl s_client -connect api.edutu.org:443 -servername api.edutu.org 2>/dev/null \
 *     | openssl x509 -pubkey -noout \
 *     | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary \
 *     | openssl enc -base64
 */

import { Platform } from 'react-native';
import { getConfig } from './config';

export interface SSLPinningConfig {
  enabled: boolean;
  enforcePinning: boolean;
  pinnedDomains: PinnedDomain[];
  backupPins: boolean;
}

export interface PinnedDomain {
  domain: string;
  publicKeyHashes: string[];
  includeSubdomains: boolean;
}

const DEFAULT_PINS: PinnedDomain[] = [
  {
    domain: 'edutu.org',
    publicKeyHashes: [],
    includeSubdomains: true,
  },
  {
    domain: 'supabase.co',
    publicKeyHashes: [],
    includeSubdomains: false,
  },
];

export function getSSLPinningConfig(): SSLPinningConfig {
  const config = getConfig();
  const isProduction = !config.isDev;

  return {
    enabled: isProduction,
    enforcePinning: isProduction,
    pinnedDomains: DEFAULT_PINS,
    backupPins: true,
  };
}

export function verifySSLCertificate(
  hostname: string,
  certificates: string[],
  _serverCertificate: string,
): boolean {
  const config = getSSLPinningConfig();

  // In development, skip pinning
  if (!config.enabled) return true;

  // Find the domain config
  const domainConfig = config.pinnedDomains.find(
    (d) =>
      hostname === d.domain ||
      (d.includeSubdomains && hostname.endsWith(`.${d.domain}`)),
  );

  // If no specific pins for this domain, allow the connection
  if (!domainConfig || domainConfig.publicKeyHashes.length === 0) {
    return true;
  }

  // Check if any of the server's certificates match our pinned hashes
  return certificates.some((cert) =>
    domainConfig.publicKeyHashes.some((pinnedHash) => cert === pinnedHash),
  );
}

// Stub — to be replaced with real react-native-ssl-pinning integration
export async function initializeSSLPinning(): Promise<void> {
  const config = getSSLPinningConfig();

  if (!config.enabled) {
    console.log('[Edutu] SSL pinning disabled (development mode)');
    return;
  }

  console.log('[Edutu] SSL pinning enabled for production');
  // TODO: Initialize react-native-ssl-pinning or TrustKit here
  // See implementation guide above
}

export default {
  getSSLPinningConfig,
  verifySSLCertificate,
  initializeSSLPinning,
};
