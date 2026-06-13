import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Opportunity } from '../../types/opportunity';
import {
  buildOpportunityShareFileName,
  buildOpportunityShareText,
  buildOpportunityShareUrl,
  fetchOpportunitySharePdfBlob,
} from '../../services/opportunityShare';

const opportunity: Opportunity = {
  id: 'opp-123',
  title: 'Global Leadership Fellowship',
  organization: 'Edutu Foundation',
  category: 'Fellowship',
  deadline: '2026-08-01T00:00:00.000Z',
  location: 'Worldwide',
  description:
    'A fully funded leadership fellowship for emerging builders who want to create public impact across Africa and beyond.',
  requirements: [],
  benefits: [],
  applicationProcess: [],
  match: 92,
  difficulty: 'Medium',
};

describe('opportunityShare helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a public share URL on the current origin', () => {
    expect(buildOpportunityShareUrl(opportunity.id)).toContain('/share/opportunity/opp-123');
    expect(buildOpportunityShareUrl(opportunity.id)).toMatch(/^https?:\/\//);
  });

  it('builds a WhatsApp-friendly share message with the public portal link', () => {
    const shareUrl = buildOpportunityShareUrl(opportunity.id);
    const message = buildOpportunityShareText(opportunity, shareUrl);

    expect(message).toContain('*Global Leadership Fellowship*');
    expect(message).toContain('Edutu Foundation · Fellowship');
    expect(message).toContain('Open the preview:');
    expect(message).toContain(shareUrl);
    expect(message).toContain('Sign up to unlock the full application details');
  });

  it('creates safe filenames for share assets', () => {
    expect(buildOpportunityShareFileName(opportunity, 'pdf')).toBe('global-leadership-fellowship-edutu.pdf');
    expect(buildOpportunityShareFileName(opportunity, 'png')).toBe('global-leadership-fellowship-edutu.png');
  });

  it('uses the backend PDF route before falling back to browser generation', async () => {
    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(pdfBlob),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchOpportunitySharePdfBlob(opportunity.id)).resolves.toBe(pdfBlob);

    expect(fetchMock).toHaveBeenCalled();
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/share-pdf');
    expect(requestInit).toMatchObject({ method: 'GET' });
  });
});
