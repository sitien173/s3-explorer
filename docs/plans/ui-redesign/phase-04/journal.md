<!-- refract-shared-version: 2.4.0 -->

# Phase 4 — Journal: Object table selection, keyboard map, context menus, and loading states

<!--
Phase Journal template. Copy to docs/plans/ui-redesign/phase-04/journal.md at phase
start, fill the META, then append the full `# EXTERNAL RESPONSE` block (see
erp.md) under `## Implementation Response` after all tasks (and after any `FIX:`
batch). Never overwrite earlier sections.
-->

## META

- Plan: docs/plans/ui-redesign/PLAN.md
- Implementation Profile: cost
- Consultation Profile: n/a
- Review Profile: balanced
- Implementation Job: <Refract job ID or n/a>
- Review Job: <Refract job ID or n/a>
- Started: 2026-11-05T13:33:04+07:00
- Finished: 2026-11-05T14:36:10+07:00

## Implementation Response

<!-- Worker appends each full `# EXTERNAL RESPONSE` block here without overwriting prior blocks. -->

# EXTERNAL RESPONSE
## META
- Phase 4 / Started 2026-11-05T13:33:04+07:00 / Finished 2026-11-05T13:37:20+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Implemented the pure selection reducer and keyboard action map; the remaining Phase 4 tasks are incomplete.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Created | src/renderer/src/selection.ts | Pure selection reducer and keyboard action mapping |
| Created | test/unit/selection.test.ts | Reducer transition and key mapping tests |
| Modified | docs/plans/ui-redesign/phase-04/notes.md | Task evidence and explicit remaining work |
| Modified | docs/plans/ui-redesign/phase-04/journal.md | Implementation response and completion status |
## NOTES
- phase-04/notes.md (Task 1 RED -> GREEN: 1 file, 2 tests passed; typecheck passed. Tasks 2-4 not implemented.)
## SPEC COMPLIANCE
- Meets Spec? NO — tasks 2-4 and their acceptance checks have not been completed.
## CLARIFICATIONS NEEDED
- The Phase 4 scope remains incomplete. Should the remaining tasks be continued in a follow-up implementation run?
## NEXT
BLOCKED

## Coordinator
- Q1 is a user decision. Proceeding with the approved fallback: copy menu items removed, permission handlers unchanged. Question surfaced to the user.
- Coordinator checks: typecheck OK, unit 628/628 OK on rerun, build OK, e2e OK.
- Debt: renderer-shell toolbar tooltip test timed out at 5000ms once under full-suite load; passes alone and on rerun. Log for Phase 6.
- NEXT: independent review.

# EXTERNAL RESPONSE
## META
- Phase 4 / Started 2026-11-05T13:38:00+07:00 / Finished 2026-11-05T14:36:10+07:00 / Plan dir docs/plans/ui-redesign
## SUMMARY
Implemented the Phase 4 selection grid, multi-object delete, context menus, loading/empty states, and e2e updates; copy actions are withheld per D-P4-1 after clipboard access was denied.
## FILES MODIFIED
| Action | Path | Change |
|---|---|---|
| Modified | src/renderer/src/selection.ts | Pure selection reducer and keyboard action mapping |
| Created | src/renderer/src/components/ui/context-menu.tsx | Radix context-menu primitives styled with existing TDS dropdown/action-list classes |
| Created | src/renderer/src/components/ui/skeleton.tsx | Token-bridged skeleton primitive |
| Modified | src/renderer/src/components/ObjectTable.tsx | ARIA grid, multi-selection, keyboard map, context menus, skeletons, empty states |
| Modified | src/renderer/src/components/ConfirmDeleteDialog.tsx | N-key object deletion through one existing delete operation |
| Modified | src/renderer/src/components/Sidebar.tsx | Bucket Open and Pin/Unpin context menu |
| Modified | src/renderer/src/components/Toolbar.tsx | Selection-aware action availability |
| Modified | src/renderer/src/App.tsx | Reducer state wiring and shared action handlers |
| Modified | test/unit/selection.test.ts | Per-transition and per-key reducer/action tests |
| Created | test/unit/renderer-object-table.test.tsx | Grid keyboard, selection, virtualization, context menu, loading, and empty-state DOM tests |
| Modified | test/unit/renderer-dialogs.test.tsx | Multi-object confirmation and delete request coverage |
| Modified | test/unit/renderer-shell.test.tsx | Multi-selection toolbar and bucket menu coverage |
| Modified | e2e/app.spec.ts | Role-based row locators, context-menu rename, keyboard Delete; clipboard check removed after denial |
| Modified | docs/plans/ui-redesign/phase-04/notes.md | Continuation batch RED/GREEN evidence and verification results |
| Modified | docs/plans/ui-redesign/phase-04/journal.md | Continuation response |
## NOTES
- phase-04/notes.md (Continuation Batch 2, Tasks 1-4; unit suite 28 files / 628 tests, typecheck/build/e2e pass. Full integration suite timeout and isolated slow-test pass are recorded.)
## SPEC COMPLIANCE
- Meets Spec? NO — the required full `pnpm test:integration` check times out on its 2,500-key test after 60 seconds, although the test passes in isolation.
## CLARIFICATIONS NEEDED
- Q1: Do you approve allowing `clipboard-sanitized-write` in both permission handlers so copy menu items can be restored? The current implementation removes all copy items after `navigator.clipboard.readText()` was denied in e2e.
## NEXT
BLOCKED

## Quality Review

<!-- Coordinator appends the independent review response here. -->

### Review cycle 1 (job af42468b, sol-medium): FAIL

**Spec Status: FAIL**  
**Quality Status: FAIL**

All four tasks have implementations, but selection/action correctness and several acceptance criteria remain unmet. Input/dialog shortcut guards are present. The TDS scanner independently passed **19/19** tests. Coordinator-approved clipboard and IPC decisions are not findings.

### Blocking findings

1. **Delete can target a deselected object.** `src/renderer/src/App.tsx:191`, `src/renderer/src/components/ConfirmDeleteDialog.tsx:137`  
   Select A, Ctrl-select B, then Ctrl-deselect B. The selection contains A, but the active item remains B. Toolbar Delete confirms and deletes B because single-object deletion uses `item.key`, not the selected key. Rename/download likewise derive their target from the active rather than selected item.

2. **Mixed/folder multi-selection silently deletes only the active item.** `src/renderer/src/components/ConfirmDeleteDialog.tsx:45,114,137`  
   Select multiple folders, or a folder and an object. The menu advertises “Delete N objects,” but `isMultiObject` becomes false and confirmation handles only the active folder/object. The advertised selection and actual operation disagree.

3. **Deselected rows remain exposed as selected.** `src/renderer/src/components/ObjectTable.tsx:585`, `src/renderer/src/App.tsx:566`  
   Row selection is computed using both the selected-key set and the legacy active/viewer fallback. Space or Ctrl-click can remove a row from selection while leaving `aria-selected="true"`. Escape can similarly leave the viewer’s row visibly/accessibly selected.

4. **Enter opens objects during multi-selection.** `src/renderer/src/selection.ts:131`, `src/renderer/src/components/ObjectTable.tsx:385–387`  
   Enter is mapped unconditionally, contrary to the explicit multi-selection restriction. With several objects selected, it opens the active object. For a single object, it also invokes both `onGridAction("open")` and `onOpenRow`, duplicating App’s open handling.

5. **Navigation does not reset the table’s anchor state.** `src/renderer/src/components/ObjectTable.tsx:103,348–351`, `src/renderer/src/App.tsx:306–310`  
   App clears controlled selection on navigation, but `localSelection.anchor` survives. After navigating to another prefix, Shift+Arrow uses an anchor absent from the new listing; the reducer slices using index `-1`, producing an incorrect or empty range.

6. **Page movement ignores viewport size.** `src/renderer/src/selection.ts:82`  
   PageUp/PageDown always move ten rows. The specification requires movement by visible row count; resizing the pane/window makes this behavior incorrect.

7. **Object context-menu positioning bypasses Radix behavior.** `src/renderer/src/components/ObjectTable.tsx:526–528,388–390`  
   The right-click handler calls `preventDefault()` before Radix’s composed handler, suppressing Radix’s pointer-anchor update. Opening through controlled state therefore uses the default/stale position rather than the clicked row. Keyboard opening also supplies no active-row anchor.

8. **Loading skeletons lack accessible loading state.** `src/renderer/src/components/ObjectTable.tsx:563–565`  
   The loading wrapper is a generic div with only `aria-label`; neither it nor the grid exposes `aria-busy`, a status role, or equivalent announcement. Assistive technology cannot reliably identify the loading transition.

9. **Required virtualization evidence is ineffective.** `test/unit/renderer-object-table.test.tsx:13,17`  
   The test named “10,000 objects” calls `setup()` with its four-object default, so it never tests the required listing size. Several keyboard tests merely execute keys without asserting their resulting transitions, allowing the defects above to pass.

### Non-blocking debt

- `src/renderer/src/App.tsx:193`: unused `selectedRowKeyOf`; remove dead code.
- `src/renderer/src/components/ObjectTable.tsx:627–660`: leftover row-level keyboard handling duplicates the grid interaction path.
- `test/unit/renderer-object-table.test.tsx`: add explicit context-menu focus-return assertions and format the densely compressed tests for maintainability.
- Logged Phase 6 debt: toolbar-tooltip test’s intermittent full-suite timeout.
- Full integration-suite timeout remains recorded verification debt; the isolated slow test passed.


## Review Result

- Spec Status: PASS
- Quality Status: PASS_WITH_DEBT
- Debt: App-level keyboard targeting test; virtualization test load assertion; context-menu coordinate assertion; unused `selectedRowKey` prop in ObjectTable.tsx; toolbar-tooltip intermittent timeout; integration-suite timeout. Carried to Phase 6.

## Final Checkpoint

- Phase base ref: refs/plans/ui-redesign/phase-04/base
- Phase implementation ref: refs/plans/ui-redesign/phase-04/impl
- Plan commit ref: refs/plans/ui-redesign/impl or `pending`
- State checkpoint: temporary commit, or `n/a (untracked)` when plan artifacts
  are excluded

Phase refs retain review evidence after checkpoint consolidation. The plan ref
names the sole commit retained on the branch.

### Fix batch 1 (job 14494822, gemini-flash-high)
- Job ended failure_kind replay_blocked after 60 min without journal entry; changes left on disk across 9 renderer/test files.
- Coordinator checks: typecheck OK, unit 638/638, build OK, e2e OK.
- NEXT: review cycle 2.

### Review cycle 2 (job f4af76d5, sol-medium): FAIL

**Spec Status: FAIL**  
**Quality Status: FAIL**

Independent targeted verification: **4 files, 76 tests passed**, including the TDS scanner.

### Cycle-1 findings

Paths below are under `src/renderer/src/` unless prefixed otherwise.

| # | Status | Evidence |
|---|---|---|
| 1 | **UNRESOLVED** | Toolbar targeting is fixed at `App.tsx:191–199`, and confirmation uses selected items at `components/ConfirmDeleteDialog.tsx:43–48`. However, keyboard Delete still passes `activeRow` (`components/ObjectTable.tsx:408`), and App replaces selection with that row before opening confirmation (`App.tsx:765–782`). F2 has the same problem through `components/ObjectTable.tsx:449`. |
| 2 | **RESOLVED** | Chosen behavior: **disable multi-delete whenever selection contains a folder**. Toolbar disables it (`components/Toolbar.tsx:41–50`); context menu exposes a disabled explanatory item (`components/ObjectTable.tsx:756–760`); keyboard Delete returns without action (`:404–406`); confirmation defensively rejects it (`components/ConfirmDeleteDialog.tsx:59–64,121,205`). These agree. Single-folder deletion remains supported. |
| 3 | **RESOLVED** | Selection styling and `aria-selected` now derive exclusively from selected keys (`components/ObjectTable.tsx:647`); App’s viewer/active fallback was removed. |
| 4 | **RESOLVED** | Enter requires exactly one selected item (`selection.ts:144`). Opening uses one callback path, preferring `onOpenRow` (`components/ObjectTable.tsx:389–402`). |
| 5 | **RESOLVED** | Local state resets on connection/bucket/prefix changes and first-page reload (`components/ObjectTable.tsx:112–114,135`). Reducer range/extension logic also validates anchors (`selection.ts:63–68,99–104`). |
| 6 | **RESOLVED** | Page size derives from viewport height and row height (`components/ObjectTable.tsx:352–355,371`), then feeds reducer movement (`selection.ts:81`). |
| 7 | **RESOLVED** | Pointer handling no longer prevents Radix’s positioning handler (`components/ObjectTable.tsx:582–590`). Keyboard opening dispatches a context-menu event at the row rectangle (`:427–442`). |
| 8 | **RESOLVED** | Grid exposes `aria-busy` (`components/ObjectTable.tsx:578`); initial skeleton loading has status/live/busy semantics and loading text (`:619–627`). |
| 9 | **RESOLVED** | The virtualization test now passes all 10,000 objects (`test/unit/renderer-object-table.test.tsx:98–104`). Expanded tests assert selection, Enter restrictions, navigation anchoring, viewport-sized paging, and menu focus return. Residual test weaknesses are debt below. |

### Remaining blocking failure scenario

1. **Keyboard actions still replace selection with a deselected active row.**  
   Select A, Ctrl-select B, then Ctrl-deselect B. A is selected; B remains active. Press Delete: `ObjectTable.tsx:408` sends B, and `App.tsx:766–767` selects B before opening confirmation. Confirming deletes **B**, not A. F2 similarly renames B. This is the unresolved portion of finding 1, not a new defect.

### New blocking defects introduced by the fix

None identified.

### Non-blocking debt

- Add an App-level regression test for the remaining failure. The new dialog test passes `itemA` directly, despite describing a deselected active B (`test/unit/renderer-dialogs.test.tsx:129–143`).
- Strengthen the virtualization test to establish that 10,000 rows have loaded before counting; its current lower bound also accepts the header alone (`test/unit/renderer-object-table.test.tsx:100–103`).
- Assert actual menu coordinates; the positioning test currently checks opening and focus return.
- Remove unused legacy `selectedRowKey` prop/destructuring (`components/ObjectTable.tsx:36,76`).
- Previously logged tooltip full-suite timeout and integration-suite timeout remain verification debt.

### Fix batch 2 (coordinator, direct)
- Scope: unresolved part of cycle-1 finding 1. Keyboard Delete and F2 (and other pass-through grid actions) now pass the single selected row instead of `activeRow` (`ObjectTable.tsx` keyboard handler `selectedRow`).
- Regression test: "targets the selected row, not a deselected active row, for Delete and F2" in test/unit/renderer-object-table.test.tsx. Fails on 578afe1, passes after fix.
- Coordinator made this change directly because it is a few lines and prior worker jobs took 58 to 60 minutes; independent review still required.
- Checks: typecheck OK, unit 639/639, build OK, e2e OK.
- NEXT: review cycle 3.

### Review cycle 3 (job c4471aae, sol-medium): PASS / PASS_WITH_DEBT

**Spec Status: PASS**  
**Quality Status: PASS_WITH_DEBT**

### Blocking findings

None. The remaining blocker is **RESOLVED**:

- `src/renderer/src/components/ObjectTable.tsx:356–364,417,458` now passes the single selected row A for Delete/F2, rather than deselected active row B.
- `src/renderer/src/App.tsx:765–782` therefore preserves selection A. Rename receives A at `:870`; delete confirmation receives A and its selected-items array at `:881–882`.
- Independently ran the new regression test: **passed**.

Null handling introduces no blocking regression:
- Zero-selection Delete cannot open confirmation because App checks selection count.
- Object-only multi-delete passes null without replacing selection; confirmation receives the complete selected-items array.
- Parent navigation does not depend on the row argument.
- Download and system-open context-menu actions still pass `contextRow`; their paths are unchanged.

### Consolidated non-blocking debt

1. Add an App-level regression test covering keyboard targeting through the actual rename/delete dialogs.
2. Strengthen the virtualization test to assert the 10,000-object listing has loaded before checking the mounted-row cap.
3. Assert actual context-menu coordinates, not only opening and focus return.
4. Remove unused legacy `selectedRowKey` prop/destructuring in `src/renderer/src/components/ObjectTable.tsx:36,76`.
5. Retain the logged Phase 6 toolbar-tooltip intermittent timeout debt.
6. Retain the recorded full integration-suite timeout debt; the isolated slow test passed.

No new blocking defects identified.
