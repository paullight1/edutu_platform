export const autoApplyStatus = {
  queued: 'Waiting to start', running: 'Preparing application', needs_input: 'Your input is needed',
  paused: 'Auto Apply paused',
  needs_review: 'Ready for review', submitting: 'Submitting', unconfirmed: 'Submission unconfirmed',
  submitted: 'Submitted', cancelled: 'Cancelled', failed: 'Application attempt failed',
};

const activityActionLabels = {
  provider_step: 'Complete a provider step',
  pdf: 'Choose a supporting PDF',
  cv: 'Choose a CV',
  statement: 'Write your statement',
  answer_format: 'Check your answer format',
  correction: 'Correct your draft',
};

export type AutoApplyActivityAction = keyof typeof activityActionLabels;
export type AutoApplyProgress = {
  id: string;
  state: keyof typeof autoApplyStatus;
  version: number;
  title?: string;
  activityAction?: AutoApplyActivityAction | null;
};

export function getAutoApplyActivityAction(state: AutoApplyProgress['state'], value: unknown) {
  if (state === 'needs_review' && value === 'correction') return value;
  if (state === 'needs_input' && (value === 'provider_step' || value === 'pdf' ||
      value === 'cv' || value === 'statement' || value === 'answer_format')) return value;
}

export function getAutoApplyActivityStatus(state: AutoApplyProgress['state'], value: unknown) {
  const action = getAutoApplyActivityAction(state, value);
  return action ? activityActionLabels[action] : autoApplyStatus[state];
}
