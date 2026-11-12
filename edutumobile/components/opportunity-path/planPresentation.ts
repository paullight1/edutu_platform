import type { OpportunityPublicStage } from '@edutu/core/src/types/opportunityJourney';

export const PLAN_STAGES: { key: OpportunityPublicStage; label: string; tone: 'blue' | 'violet' | 'mint' | 'peach' }[] = [
  { key: 'pursuing', label: 'Pursuing', tone: 'blue' },
  { key: 'discover', label: 'Shortlist', tone: 'violet' },
  { key: 'applied', label: 'Applied', tone: 'mint' },
  { key: 'outcome', label: 'Closed', tone: 'peach' },
];
export const PLAN_PAGE_SIZE = 3;

export function planPalette(dark: boolean) {
  return dark ? {
    blue: { background: '#122C46', ink: '#C6E4FF', border: '#31567A' },
    violet: { background: '#292449', ink: '#E0D8FF', border: '#51457D' },
    mint: { background: '#10372D', ink: '#BAF5DD', border: '#28634F' },
    peach: { background: '#3E281E', ink: '#FFDDC8', border: '#78503B' },
  } : {
    blue: { background: '#E8F3FF', ink: '#154471', border: '#BCDDFB' },
    violet: { background: '#F0ECFF', ink: '#49368B', border: '#DCD3FB' },
    mint: { background: '#E8F8F0', ink: '#15543D', border: '#BEE8D2' },
    peach: { background: '#FFF0E6', ink: '#7D3E1D', border: '#F4D3BD' },
  };
}
