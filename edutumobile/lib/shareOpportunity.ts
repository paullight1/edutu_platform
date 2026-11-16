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
import { File, Paths } from 'expo-file-system';
import { Opportunity } from '@edutu/core/src/types/opportunity';
import { getConfig } from './config';
import i18n from './i18n';

const SHARE_TEXT_LIMITS = {
  summary: 360,
  section: 132,
  apply: 160,
};

// Public Edutu opportunity page. Shares must point here — a branded landing that
// tracks and routes to Apply — NOT the raw third-party application link.
const EDUTU_WEB_URL = 'https://www.edutu.org';
export function buildOpportunityShareUrl(id: string): string {
  return `${EDUTU_WEB_URL}/opportunity/${encodeURIComponent(id)}`;
}

/** True when the caption already carries this link. Tolerates www./trailing-
 * slash variants so a backend caption never gets the same link appended twice. */
export function shareTextIncludesUrl(text: string, url: string): boolean {
  const key = url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '');
  return key.length > 0 && text.includes(key);
}

export function cleanShareText(value?: string | null, fallback: string = i18n.t('misc:share.notSpecified')): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text || fallback;
}

export function clampShareText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function formatShareDeadline(deadline?: string | null): string {
  if (!deadline) return i18n.t('misc:share.rollingDeadline');
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  // Day-month-year (e.g. "31 July 2026") to match Edutu's audience.
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
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
      ? i18n.t('misc:share.fundingAvailable')
      : i18n.t('misc:share.openOpportunity'),
  );
}

/**
 * WhatsApp-native fallback caption (used only when the backend share-card call
 * fails — otherwise the backend's canonical shareText ships). Uses WhatsApp
 * markdown (*bold*, _italic_, "- " bullets); each optional row is conditional
 * so we never render an empty label.
 */
export function buildMobileOpportunityShareText(opportunity: Opportunity): string {
  const title = cleanShareText(opportunity.title, i18n.t('misc:share.fallbackTitle'));
  const summary = clampShareText(
    cleanShareText(opportunity.aiSummary || opportunity.description || '', ''),
    SHARE_TEXT_LIMITS.summary,
  );
  const type = cleanShareText(opportunity.category, '');
  const duration = cleanShareText(
    (opportunity as any).duration || (opportunity as any).program_duration || '',
    '',
  );
  const audience = cleanShareText(
    (opportunity as any).targetAudience || (opportunity as any).target_audience || '',
    '',
  );
  const deadline = formatShareDeadline(opportunity.deadline);
  const gains = (opportunity.benefits || [])
    .map((benefit) => clampShareText(cleanShareText(benefit, ''), SHARE_TEXT_LIMITS.section))
    .filter(Boolean)
    .slice(0, 5);

  const lines: string[] = [`*${title}*`];

  if (summary) lines.push('', `_${summary}_`);

  const facts: string[] = [];
  if (type) facts.push(`- *${i18n.t('misc:share.typeLabel')}:* ${type}`);
  if (duration) facts.push(`- *${i18n.t('misc:share.durationLabel')}:* ${duration}`);
  if (audience) facts.push(`- *${i18n.t('misc:share.audienceLabel')}:* ${audience}`);
  facts.push(`- *${i18n.t('misc:share.deadlineLabel')}:* ${deadline}`);
  lines.push('', ...facts);

  if (gains.length > 0) {
    lines.push('', `*${i18n.t('misc:share.whatYouGain')}:*`, '', ...gains.map((gain) => `- ${gain}`));
  }

  lines.push('', `*${i18n.t('misc:share.applyHere')}:*`, '', buildOpportunityShareUrl(opportunity.id));

  return lines.join('\n');
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
    const link = payload.shareUrl || buildOpportunityShareUrl(opportunity.id);
    // Caption always carries the summary AND the Edutu link — never a bare
    // image, and never the same link twice.
    const message = shareTextIncludesUrl(payload.shareText, link)
      ? payload.shareText
      : `${payload.shareText}\n${link}`;

    // Android: Expo can't attach an image AND text/link in one share intent, so
    // share the caption + link (the link unfurls to the branded share-card image
    // via the opportunity page's Open Graph tags) rather than a silent image.
    if (Platform.OS !== 'ios') {
      await Share.share({ title: opportunity.title, message });
      return true;
    }

    // iOS: one sheet carries the branded image AND the caption/link.
    if (payload.imageUrl) {
      const downloaded = await downloadShareImage(payload.imageUrl, opportunity.id);
      if (downloaded) {
        await Share.share({
          title: opportunity.title,
          message,
          url: downloaded.uri,
        });
        return true;
      }
    }

    // iOS fallback: caption + link (no on-device card ref available here).
    await Share.share({ title: opportunity.title, message });
    return true;
  } catch (error) {
    console.error('Failed to share opportunity:', error);
    return false;
  }
}
