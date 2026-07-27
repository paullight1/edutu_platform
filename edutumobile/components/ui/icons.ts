/**
 * Hugeicons used on the opportunity surfaces.
 *
 * IMPORT DISCIPLINE — every icon here comes from a per-icon subpath
 * (`@hugeicons/core-free-icons/CompassIcon`), never from the package root.
 * The root barrel is a single ~6.2 MB module re-exporting all 5,400 icons and
 * Metro does not tree-shake, so one bare `from '@hugeicons/core-free-icons'`
 * anywhere in the app ships the entire set into the bundle. Add new icons to
 * this file in the same style and import them from here, so there is exactly
 * one place to audit.
 *
 * Hugeicons is used for Edutu's *own* voice — the AI read, the assist actions,
 * the decision strip. The rest of the app stays on lucide-react-native; this
 * is not a migration.
 */

export { default as AiBrain01Icon } from '@hugeicons/core-free-icons/AiBrain01Icon';
export { default as Alert02Icon } from '@hugeicons/core-free-icons/Alert02Icon';
export { default as ArrowRight01Icon } from '@hugeicons/core-free-icons/ArrowRight01Icon';
export { default as BubbleChatQuestionIcon } from '@hugeicons/core-free-icons/BubbleChatQuestionIcon';
export { default as CalendarCheckIn01Icon } from '@hugeicons/core-free-icons/CalendarCheckIn01Icon';
export { default as CheckmarkCircle02Icon } from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
export { default as CompassIcon } from '@hugeicons/core-free-icons/CompassIcon';
export { default as FileUploadIcon } from '@hugeicons/core-free-icons/FileUploadIcon';
export { default as Navigation03Icon } from '@hugeicons/core-free-icons/Navigation03Icon';
export { default as Target02Icon } from '@hugeicons/core-free-icons/Target02Icon';
export { default as UserCircleIcon } from '@hugeicons/core-free-icons/UserCircleIcon';

export { HugeiconsIcon } from '@hugeicons/react-native';
