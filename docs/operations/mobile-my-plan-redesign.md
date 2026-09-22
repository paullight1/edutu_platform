# My Plan redesign — 9 September 2026

Implemented from the liquid-glass review and the Appllama App Design skill. Appllama MCP was unavailable in this session; no competitor-library benchmarking was performed.

## Result

- Global Home / My Plan / Explore / More tabs remain available throughout the workspace. The AI shortcut retains its purpose. Peer navigation uses `navigate` instead of adding another pushed route on every tap.
- My Plan has separate Overview, Applications, Deadlines, Goals and Roadmaps sections. Section changes replace the current workspace page. Detail screens retain focused back navigation without the Home header or bottom bar.
- Native regular glass draws the navigation and toolbar surfaces on supported iOS builds. The material checks both native availability APIs and uses an opaque theme surface for unsupported platforms, Reduce Transparency or high contrast. Removed route-driven collapse, zero-opacity glass animation and fixed startup-width geometry. Enlarged labels can wrap.
- Journey cards show status, title, deadline, preparation progress and one next step. Detail pages use a summary, progress panel and accessible checklist controls. Existing task mutations, version checks, idempotency keys, submission confirmation and offline write guards are preserved.
- Initial loading uses card skeletons; initial failures and empty states use the existing illustrated StateView. Refresh failures keep existing content visible.
- Application cards give titles more room and separate opening details from updating status. Deadline cards use quieter dividers, deduplicate saved/applied copies and separate past deadlines from upcoming work.
- Goals uses the workspace header, theme accents and full-width roadmap-step cards within My Plan. Its filter menu opens from the bottom. Roadmaps uses larger single-column cards, quieter filters and a contextual create action in the workspace header.

This retains the existing router and custom navigation controls. It is not a migration to Expo Router NativeTabs or independent native tab stacks. Existing alternative navigation-style preferences remain available. A native-tabs migration still needs a broader route-architecture pass.

## Verification

- Mobile TypeScript check passed.
- Targeted ESLint checks passed with zero warnings.
- 69 distinct tests passed: My Plan reads/retries and actions, shell/navigation, deadline presentation, Goals workflows, Roadmaps/templates, and native glass compatibility/accessibility fallbacks. Some existing React act warnings and Jest open-handle warnings remain in the broader suites.
- Inspected the running iPhone 17 / iOS 26.5 workspace, including populated Applications and Deadlines, Goals and Roadmaps. Recorded a navigation pass to `/tmp/edutu-my-plan-redesign.mov`. The recording is not a frame-rate measurement.
- Journey Overview currently receives no usable data from its API. Its live failure state was inspected; populated journey cards and checklist behavior were tested with fixtures. Live end-to-end journey persistence, a release-device performance run, Android rendering, and a complete dark-mode/large-text/RTL visual matrix remain unverified.

No backend services were changed by this redesign. Existing unrelated working-tree changes were preserved.
