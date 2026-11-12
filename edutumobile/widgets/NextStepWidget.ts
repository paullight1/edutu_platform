export type NextStepItem = {
  journeyId: string;
  taskId: string;
  title: string;
  opportunity: string;
  dueAt: string | null;
  deadline: string | null;
  completed: number;
  total: number;
  deepLink: string;
};
export type NextStepWidgetProps = {
  items: NextStepItem[];
  state: 'ready' | 'empty' | 'signed_out' | 'unavailable';
  stale?: boolean;
  mascotUri?: string;
};
export function updateNextStepWidget(_props: NextStepWidgetProps): void { return; }
export default { updateSnapshot: updateNextStepWidget };
