/**
 * Shared opportunity share logic used by the feed/home cards and the detail
 * screen. Tries the backend-generated branded share-card image first, then
 * falls back to a text + link share.
 *
 * The richer on-device ViewShot capture path lives only on the detail screen
 * (it needs a rendered ref); this helper deliberately covers the
 * backend-card-or-text fallback so any card can share without a rendered ref.
 */
import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { getConfig } from './config';

const SHARE_TEXT_LIMITS = {
  summary: 360,
  section: 132,
  apply: 160,
};

export function cleanShareText(value?: string | null, fallback = 'Not specified'): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || fallback;
}

export function clampShareText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function formatShareDeadline(deadline?: string | null): string {
  if (!deadline) return 'Rolling / Not specified';
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getShareFunding(opportunity: Opportunity): string {
  if (opportunity.stipend) {
    const amount = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(opportunity.stipend);
    return `${opportunity.currency || ''} ${amount}`.trim();
  }

  const fundedBenefit = opportunity.benefits?.find((benefit) =>
    /fund|stipend|tuition|grant|award/i.test(benefit),
  );
  return cleanShareText(
    fundedBenefit,
    opportunity.category?.toLowerCase().includes('scholarship')
      ? 'Funding available'
      : 'Open opportunity',
  );
}

function getShareEligibility(opportunity: Opportunity): string {
  const eligibility = (opportunity.eligibility || {}) as Record<string, any>;
  const countries = eligibility.countries;
  const level = eligibility.level || eligibility.degree || eligibility.education_level;

  if (Array.isArray(countries) && countries.length > 0) {
    return countries.length > 3
      ? `${countries.slice(0, 3).join(', ')} +${countries.length - 3}`
      : countries.join(', ');
  }

  if (typeof countries === 'string') return countries;
  if (typeof level === 'string') return level;
  return opportunity.location || 'Open to eligible applicants';
}

function getShareBullets(items?: string[], fallback?: string, limit = 5): string[] {
  const cleaned = (items || [])
    .map((item) => clampShareText(cleanShareText(item, ''), SHARE_TEXT_LIMITS.section))
    .filter(Boolean);

  if (cleaned.length > 0) return cleaned.slice(0, limit);
  return fallback
    ? [clampShareText(cleanShareText(fallback), SHARE_TEXT_LIMITS.section)]
    : ['Details available in Edutu.'];
}

export function buildMobileOpportunityShareText(opportunity: Opportunity): string {
  const expired = opportunity.deadline
    ? new Date(opportunity.deadline).getTime() < Date.now()
    : false;
  const benefits = getShareBullets(opportunity.benefits, getShareFunding(opportunity), 2);
  const benefitLines = benefits
    .map((benefit, index) => `${index === 0 ? '⭐' : '✅'}${benefit}`)
    .join('\n');

  return [
    `${expired ? 'Deadline Passed' : 'Still Active'}!`,
    '',
    cleanShareText(opportunity.title, 'Edutu opportunity'),
    '',
    `Sponsor: ${cleanShareText(opportunity.organization, 'Edutu')}`,
    '',
    'Benefits:',
    benefitLines,
    '',
    `Category: ${cleanShareText(opportunity.category, 'Opportunity')}`,
    `Eligible Country: ${getShareEligibility(opportunity)}`,
    `Deadline: ${formatShareDeadline(opportunity.deadline)}`,
    '',
    'Click the link below to apply📌',
    opportunity.applyUrl || 'https://edutu.ai',
    '',
    'Kindly share with your friends who might be interested.',
  ].join('\n');
}

export async function getBackendSharePayload(
  opportunity: Opportunity,
): Promise<{ imageUrl: string | null; shareText: string; shareUrl?: string | null }> {
  const fallbackText = buildMobileOpportunityShareText(opportunity);
  if (opportunity.shareImageUrl) {
    return { imageUrl: opportunity.shareImageUrl, shareText: fallbackText };
  }

  try {
    const response = await fetch(
      `${getConfig().apiBaseUrl}/opportunities/${opportunity.id}/share-card`,
      { method: 'POST' },
    );
    if (!response.ok) return { imageUrl: null, shareText: fallbackText };

    const payload = await response.json();
    return {
      imageUrl:
        typeof payload?.shareCard?.url === 'string' ? payload.shareCard.url : null,
      shareText:
        typeof payload?.shareText === 'string' ? payload.shareText : fallbackText,
      shareUrl: typeof payload?.shareUrl === 'string' ? payload.shareUrl : null,
    };
  } catch {
    return { imageUrl: null, shareText: fallbackText };
  }
}

export async function downloadShareImage(
  url: string,
  opportunityId: string,
): Promise<{ uri: string; mimeType: string } | null> {
  try {
    const extension = url.toLowerCase().includes('.svg') ? 'svg' : 'png';
    const mimeType = extension === 'svg' ? 'image/svg+xml' : 'image/png';
    const target = new File(Paths.cache, `edutu-opportunity-${opportunityId}.${extension}`);
    const file = await File.downloadFileAsync(url, target);
    return { uri: file.uri, mimeType };
  } catch {
    return null;
  }
}

/**
 * Share a branded opportunity card. Attempts the backend share-card image,
 * otherwise falls back to a text + link share. Returns true when a share sheet
 * was presented. Safe to call from any card (no rendered ref required).
 */
export async function shareOpportunity(opportunity: Opportunity): Promise<boolean> {
  try {
    const payload = await getBackendSharePayload(opportunity);
    const canShareFile = await Sharing.isAvailableAsync();

    if (payload.imageUrl && canShareFile) {
      const downloaded = await downloadShareImage(payload.imageUrl, opportunity.id);
      if (downloaded) {
        if (Platform.OS === 'ios') {
          await Share.share({
            title: opportunity.title,
            message: payload.shareText,
            url: downloaded.uri,
          });
        } else {
          await Sharing.shareAsync(downloaded.uri, {
            mimeType: downloaded.mimeType,
            dialogTitle: 'Share opportunity',
          });
        }
        return true;
      }
    }

    // Text + link fallback.
    await Share.share({
      title: opportunity.title,
      message: payload.shareText,
      url: payload.shareUrl || opportunity.applyUrl || 'https://edutu.ai',
    });
    return true;
  } catch (error) {
    console.error('Failed to share opportunity:', error);
    return false;
  }
}
