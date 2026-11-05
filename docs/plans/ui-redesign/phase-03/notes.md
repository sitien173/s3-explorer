<!-- refract-shared-version: 2.4.0 -->

# Phase 3 — Decision Notes

## Task 1

### Decisions made
- none

### Spec deviations
- No shell DOM test was written or run. The phase tasks were not completed in this batch.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Complete the requested DOM tests test-first, including pane remount persistence, viewer conditional rendering, toolbar names/tooltips, sidebar reachability, breadcrumb navigation, and no-connection empty state.

### Test evidence
- RED -> GREEN:
  - RED: none; no behavioral test was added.
  - GREEN: none.
- Root cause (bugfix only): none

## Task 2

### Decisions made
- Installed `react-resizable-panels` at the exact requested version 4.18.1. Inspection of the installed package confirms the v4 type declarations include `Group`, `Panel`, and `Separator` APIs described by D-P3-1.

### Spec deviations
- Resizable, alert, and empty primitives and pane wiring were not implemented.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Implement and test pane persistence using the API in D-P3-1; current package installation alone does not meet the task.

### Test evidence
- RED -> GREEN:
  - RED: none; no behavioral test was added.
  - GREEN: `pnpm typecheck` -> exit 0; `pnpm test` -> 25 files and 580 tests passed. These are baseline checks, not evidence for the unfinished task.
- Root cause (bugfix only): none

## Task 3

### Decisions made
- `tds rules` was run. `tds component side-nav` and `tds component breadcrumb` returned component markup/CSS; `tds component alert` reported `Component "alert" not found`. No CSS or component changes were made.

### Spec deviations
- Sidebar, toolbar, breadcrumb, alerts, empty state, and search-navigation behavior were not migrated or tested.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Resolve the alert primitive styling source with the coordinator or use only the established TDS announcement CSS/classes. Run the Rule 10 self-check after implementing UI changes.

### Test evidence
- RED -> GREEN:
  - RED: none; no behavioral test was added.
  - GREEN: none.
- Root cause (bugfix only): none

## Task 4

### Decisions made
- none

### Spec deviations
- e2e selectors were not changed.

### Tradeoffs accepted
- none

### Assumptions
- none

### Follow-ups for human
- Replace the specified sidebar and breadcrumb class selectors with role/label locators, then run e2e.

### Test evidence
- RED -> GREEN:
  - RED: none; no behavioral test was added.
  - GREEN: none.
- Root cause (bugfix only): none

## Continuation batch

### Task 1

#### Decisions made
- Added DOM coverage for `useDefaultLayout` restoration, conditional viewer panel visibility, Toolbar accessible names and focus tooltips, Breadcrumb navigation role/name, and empty-state content.

#### Spec deviations
- Sidebar connection reachability is represented by a named button in the shell test rather than rendering the full Sidebar with its IPC-backed data flow. Viewer conditional rendering is tested on the panel group, not App's full IPC-backed render.

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> failed the focus-tooltip assertion: expected the role=tooltip text to contain `Refresh`, received no tooltip.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> 1 file, 4 tests passed.
- Root cause (bugfix only): none

### Task 2

#### Decisions made
- Adapted the shadcn resizable primitive to `Group`, `Panel`, and `Separator`; used `useDefaultLayout({ id: "app-shell", panelIds })` with changing panel IDs. Viewer panel is conditional. Added alert, empty, and breadcrumb primitives. Sidebar and main panes are resizable; viewer renders in its own conditional pane.

#### Spec deviations
- none

#### Tradeoffs accepted
- `pnpm add` required `react-resizable-panels@4.18.1` in `pnpm-workspace.yaml`'s `minimumReleaseAgeExclude`, retained as required by pnpm.

#### Assumptions
- Viewer selection state already expresses whether its panel should be present.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> restored layout was `undefined` instead of `{ left: 65, right: 35 }` with inert hook scaffold.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> 1 file, 4 tests passed using the v4 hook and callback.
- Root cause (bugfix only): none

### Task 3

#### Decisions made
- Toolbar actions use Button and Tooltip; SearchBar actions use Button; Breadcrumb uses the new primitive; SSO and session announcements use Alert; the no-connection empty state uses Empty. Sidebar uses TDS side-nav and nav classes, and the official CSS was saved from `tds component side-nav`.

#### Spec deviations
- App's legacy viewer branches remain guarded by false conditions after moving viewer rendering to its own pane; they should be cleaned up in a follow-up surgical cleanup.

#### Tradeoffs accepted
- none

#### Assumptions
- Existing search cancellation handlers remain intact; navigation paths were not altered.

#### Follow-ups for human
- Remove the now-dead legacy Viewer JSX branches in App.tsx.

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> scanner asserted every TDS CSS file starts with its marker; the new side-nav stylesheet initially lacked `/* tds component: side-nav */`.
  - GREEN: `pnpm test` -> 26 files, 584 tests passed; `pnpm typecheck` -> exit 0; `pnpm build` -> exit 0.
- Root cause (bugfix only): marker generated by the established scanner convention was absent from the TDS component CSS file.

### Task 4

#### Decisions made
- Replaced the sidebar connection selector with `getByRole("button", { name: "RustFS E2E manual", exact: true })`; breadcrumb assertion uses the `navigation` role and `Breadcrumb` name.
- TDS Rule 10 self-check: page backgrounds remain light semantic surfaces; no new hard-coded color values; TDS CSS is sourced from `tds component side-nav`; buttons retain TDS button variants; navigation controls retain accessible names and focus-visible uses `--border-focus`. The side-nav component CSS is imported from `styles/tds/side-nav.css`.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `xvfb-run -a pnpm e2e` -> first role locator timed out because `/connection/i` did not match the accessible name; second matched edit/delete buttons too; then e2e exposed duplicate Viewer rendering after pane wiring.
  - GREEN: `xvfb-run -a pnpm e2e` -> 1 passed after exact name locator and conditional panel fix; `pnpm typecheck` -> exit 0; final `pnpm test` -> 26 files, 584 tests passed; `pnpm build` -> exit 0.
- Root cause (bugfix only): e2e locator was not scoped to the connection button's accessible name and legacy viewer markup rendered a second viewer.

## Fix batch 1

### Task 1: Remove dead in-main viewer JSX

#### Decisions made
- Main content now branches only on whether a bucket is selected; the Viewer is rendered exclusively in the conditional `viewer` ResizablePanel. Removed viewer-specific casts and removed the `app-browser-body--with-viewer` class toggle from App.tsx. CSS rules remain untouched.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- Existing `setViewerTarget(null)` handlers continue to close the panel.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `rg -n 'false && viewerTarget|app-browser-viewer-pane|as ViewerTarget' src/renderer/src/App.tsx` -> found disabled viewer branches and non-null casts.
  - GREEN: same command -> no matches. `pnpm typecheck` -> exit 0.
- Root cause (bugfix only): stale viewer JSX was left behind when rendering moved to its own panel.

### Task 2: Exercise the real Sidebar in DOM tests

#### Decisions made
- Mocked the renderer API module and rendered actual Sidebar instances backed by one manual connection and zero connections. The test queries the connection by role and accessible-name prefix and checks the empty-state message.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> role query with the assumed complete accessible name found no button, then the broader regex matched connection, Edit, and Delete buttons; test output showed the real connection button and its label/tag text.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> 1 file, 4 tests passed; the real Sidebar is mounted for both populated and empty connection results.
- Root cause (bugfix only): test locator used an assumed accessible-name serialization that did not match Testing Library's computed name; narrowed to the unique connection-name prefix.

### Task 3: Verify viewer close removes its panel

#### Decisions made
- Added a DOM close interaction that asserts the `viewer` panel is absent after clicking its close action. Confirmed the `shouldClearViewerTarget` characterization tests in `renderer-transfers.test.ts` remain present and unchanged.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> before adding the close interaction, no DOM assertion covered removal of the viewer panel on close.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> 1 file, 4 tests passed, including viewer open and close panel assertions.
- Root cause (bugfix only): none

## Fix batch 2

### Task 1: Fixed three-panel layout wiring and regression test

#### Decisions made
- Added `AppShell` as the shared presentational wiring; it always mounts the three panels with fixed IDs and collapses/expands the viewer via `panelRef`. Test observes actual library panel `style` and the persisted localStorage layout.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- The panel package's styles/data attributes are the observable layout evidence in jsdom; geometry is unavailable there.

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> new AppShell behavior assertion failed because the previous wiring emitted no `[data-panel]` sidebar node.
  - GREEN: same command -> 1 file, 5 tests passed; saved three-panel layout restores on remount and sidebar style remains stable when the viewer opens.
- Root cause (bugfix only): app used variable panel IDs and conditionally omitted the viewer, so its persisted layout identity changed; numeric sizes were pixel units.

### Task 2: TDS layout and accessibility corrections

#### Decisions made
- Kept `tds-nav-list` around only the connection list; used an app layout selector to override the TDS fixed side-nav width. Kept `tds-breadcrumbs` on the nav only, put `BreadcrumbList` in the ordered list, and reset list styling with one app layout rule.
- Added a focused exception and fixture to the styling scanner for the required `.app-sidebar.tds-side-nav` selector.

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm test` -> scanner reported `.tds-side-nav` in the required `.app-sidebar.tds-side-nav` selector as a prefix violation.
  - GREEN: `pnpm typecheck && pnpm test` -> typecheck passed; 26 files and 585 tests passed including scanner fixture and all renderer source scans.
- Root cause (bugfix only): scanner disallowed every non-app class in app.css, including the explicitly required TDS override selector.

### Task 3: Alerts, tooltip, empty-state, and separator fixes

#### Decisions made
- Alert defaults to `status` and caller props can override; the App error announcement opts into `alert`. Removed toolbar tooltip overrides, moved main-empty layout class to its call site, and added separator hit target, hover, and focus-visible treatment.

#### Spec deviations
- none

#### Tradeoffs accepted
- Repository has no format script or configured formatter; changed JSX/CSS was formatted manually using tab indentation and multiline shell markup.

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> missing real panel wiring failed the new panel assertion.
  - GREEN: `pnpm exec vitest run test/unit/renderer-shell.test.tsx --project unit` -> 1 file, 5 tests passed.
- Root cause (bugfix only): see Task 1 root cause.

### Task 4: Fresh phase verification

#### Decisions made
- none

#### Spec deviations
- none

#### Tradeoffs accepted
- none

#### Assumptions
- none

#### Follow-ups for human
- none

#### Test evidence
- RED -> GREEN:
  - RED: none (verification only; behavioral RED is recorded above).
  - GREEN: `pnpm typecheck` -> exit 0; `pnpm test` -> 26 files / 585 tests passed; `pnpm build` -> exit 0; `xvfb-run -a pnpm e2e` -> 1 passed; `git diff --check` -> clean.
- Root cause (bugfix only): none

