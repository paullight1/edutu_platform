# CV page usability improvements — 31 October 2026

This pass improves the existing learner CV page. It preserves the current API contracts, access rules and saved CV data. It does not deploy the app or change CV generation/charging policy.

## Interface changes

- Saved CVs now appear above the template gallery, ordered by last update. Search matches CV names and design names and includes a clear no-results state.
- Saved cards show their design, CV name, update date and a labelled preview action. Card actions align consistently; compact horizontal cards make the phone library easier to scan.
- A visible Create CV action, calmer import/AI cards, readable template descriptions, and consistent Free/Paid plan labels clarify the available paths.
- Rename now uses a focused name dialog rather than opening the complete editor. It submits the existing data, design and revision token with the new name.
- CV name is distinguished from the full name printed on the document. Skills have typing guidance, writing fields support multiple lines, and date fields explain accepted formats. A current role disables its end date without deleting the stored value.
- Preparation checks include actions to the relevant editor section. The score is explained as a clarity/completeness check, not a prediction of application success.
- AI actions are labelled Improve CV, Tailor CV and Draft cover letter. Results have a way back to the tools, the cover letter field has an accessible name, and applying a suggestion is distinguished from saving it.

## Functionality fixes

| Problem | Result |
| --- | --- |
| Opening a saved preview bypassed the unsaved-draft check. | Preview selection respects the existing discard confirmation and preserves edits when cancelled. |
| Typing a comma after a skill immediately removed the comma. | The field preserves raw typing while storing a clean skills array; restoring/reloading content also updates the field. |
| Opening the LinkedIn picker reset the selected CV before a file was chosen. | Cancelling the picker leaves the current CV intact. Import validates PDF/ZIP type, non-empty content and the 10 MB limit. |
| Imported data was merged into the currently selected CV. | The imported proposal is separate, with a new-CV save path; unrelated fields from the previous CV are not blended into it. |
| An old search or AI response could arrive after navigation. | Searches ignore cancelled results; AI/import requests have cancellation and operation-identity checks. Changing the CV route clears the old operation's busy state. |
| Cover-letter results could be empty and had no route back to tool selection. | Empty results produce an error; a Back to AI tools action preserves the selected CV and instructions. |
| Long names could exceed the server limit after appending “copy” or “tailored”. | Generated version names respect the 150-character limit. |

## Verification scope

CV page tests exercise library ordering/search, direct rename, draft protection, picker cancellation, imports, application guidance, editor controls, skill typing, cover-letter navigation and cancelled generation. The PDF/export suites run separately from the page's UI mocks.

Chromium uses the real CV components, CSS, editor and preview code with explicit session/access/API fixtures. Fixture names and content are invented. These checks do not establish live provider quality, successful production writes or real-device keyboard behavior.

Browser captures and the fixture script are in `output/playwright/`, prefixed `edutu-cv-`. The mobile capture omits the surrounding app shell; the shell supplies the sticky page title in the complete app.

The earlier review's CV fallback provenance and charging findings remain open; see `2026-10-31-edutu-web-core-review.md`. No backend or billing policy was changed here.

## Recorded results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm run lint`, followed by ESLint on the changed CV components/tests | Passed with the zero-warning requirement. |
| Final `npm run build` | Passed, including SEO verification and prerendering. The existing opportunity dynamic-import warning remains. |
| CV page + export/PDF suites | 18 tests passed before adding the route-cancellation regression. |
| `npx vitest run src/features/cv src/test/__tests__/CommunityCreateGroupPage.test.tsx --maxWorkers=1 --testTimeout=30000` | 21 passed after the cancellation fix. After the final skills synchronization refinement, the repeat run passed 20 and timed out on the cover-letter case; that case subsequently passed in isolation with a 60-second command-line test limit. Source timeout settings were not changed. |
| `npm run test -- --pool=threads --maxWorkers=2 --testTimeout=30000` | Broad run during implementation: 161 files passed, 2 failed; 732 tests passed, 2 failed. Both failed cases passed in the focused reruns. This is not a final all-suite green run. |
| Browser | Filtering, card action disclosure, direct rename and raw skills typing passed with explicit fixtures. Desktop/phone screenshots were inspected. The phone editor measured top 0 and height 844 in an 844-pixel viewport. |
| `git diff --check` | Passed. |

The broad failures were `CvPage.test.tsx` → “preserves advanced sections and uses the saved revision when editing” (the awaited Edit button was not available before the query deadline) and `CommunityCreateGroupPage.test.tsx` → “lets the creator cancel a pending proposal” (the destination text was not available before the query deadline). Both passed in the isolated CV/community runs. The final repeat's “labels the cover-letter action and provides a way back to AI tools” exceeded its 30-second test deadline under machine load, then passed on its isolated rerun. No production failure is established by those timing failures, and no complete-suite pass is claimed.

**Verdict:** local CV usability changes are verified with the limits above. Live signed-in generation, real-device keyboards and production acceptance remain unverified. Nothing was deployed.
