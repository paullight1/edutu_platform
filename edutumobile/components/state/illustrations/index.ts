/**
 * Code-drawn SVG illustrations, themed off the active colour pack.
 *
 * This is the canonical home for the illustration set. It began life under
 * `components/ui/illustrations/` while the CV wizard was being built; the state
 * system uses the same medium for Tier 2 and Tier 3, so keeping two illustration
 * families in two directories would have guaranteed they drifted apart.
 *
 * MIGRATION NOTE: `components/ui/illustrations/` still exists on disk with the
 * original copies of these files, because that work is in flight in another
 * working session and deleting it would have destroyed uncommitted edits. Once
 * that lands, delete the old directory and repoint its importers here. Nothing
 * in `components/state/` imports from the old path.
 *
 * MEDIUM: SVG drawn in code rather than shipped as PNG or Lottie, so every
 * illustration inherits the active theme pack, stays crisp at any size, costs
 * nothing in bundle weight, and reads correctly in light and dark. Tier 1 hero
 * scenes are a different medium — composed RN views driven by Reanimated — and
 * live in `components/state/scenes/`.
 */

export {
    EmptyCvIllustration,
    TemplatePickIllustration,
    ExportSuccessIllustration,
    AiTailorIllustration,
    AtsScanIllustration,
} from './CvIllustrations';

export {
    StepBasicsIllustration,
    StepSummaryIllustration,
    StepExperienceIllustration,
    StepEducationIllustration,
    StepExtrasIllustration,
    STEP_ILLUSTRATIONS,
    type StepIllustrationKey,
} from './StepIllustrations';

export {
    useIllustrationPalette,
    type IllustrationPalette,
    type IllustrationProps,
} from './palette';
