# Manual verification checklist

Run these checks on a desktop session with a working keyring and access to the
AWS account. Use test resources where possible.

- [ ] Sign in with AWS SSO, select the intended profile, and verify its buckets
  load without entering long-lived access keys.
- [ ] Expire or revoke the SSO session, refresh the connection, and verify the
  expired-session banner explains that sign-in is needed again.
- [ ] Browse a bucket in a region different from the profile configured
  region, and verify the region redirect allows the bucket to load.
- [ ] Add a connection and save its secret while the desktop keyring is
  available; restart the app and verify the secret remains available through
  the keyring.
- [ ] Install and launch the AppImage; verify the app opens and can browse a
  test bucket.
- [ ] Install the .deb on a supported Debian or Ubuntu desktop; verify its
  dependencies install and the app launches and browses a test bucket.
- [ ] In the object browser list and grid, navigate items using ArrowUp, ArrowDown, ArrowLeft, ArrowRight, PageUp, PageDown, Home, and End; verify active item and selection update.
- [ ] Extend row selections using Shift+ArrowUp and Shift+ArrowDown in list view, or Shift with arrow keys in grid view; verify contiguous multi-selection.
- [ ] Toggle individual item selection using Ctrl+Space or Cmd+Space, preview objects using Space for Quick Look, select all rows with Ctrl+A or Cmd+A, and clear selection with Escape.
- [ ] Select a single folder or object and press Enter; verify folders navigate and objects open in the viewer. Verify Enter does nothing when multiple rows are selected.
- [ ] Press Alt+ArrowUp or Backspace; verify navigation to the parent folder.
- [ ] Select a single item and press F2; verify the rename dialog opens. Verify F2 does nothing when multiple rows are selected.
- [ ] Select one or more objects and press Delete; verify the delete confirmation dialog opens. Select a single folder and press Delete; verify the delete confirmation dialog opens. Select several items including a folder and press Delete; verify nothing happens.
- [ ] Press ContextMenu or Shift+F10 on an active row; verify the context menu opens at the active row.
- [ ] Focus an input field or open a modal dialog, and verify grid keyboard shortcuts do not fire.
- [ ] Right-click a single object in the grid; verify the context menu contains Open, Open with system app, Download, Rename or move, and Delete.
- [ ] Right-click a single folder in the grid; verify the context menu contains Open, Rename folder, and Delete folder.
- [ ] Right-click a multi-selection of objects; verify the context menu contains Delete N objects. If any folders are included, verify the menu shows disabled Delete because folders cannot be multi-deleted.
- [ ] Right-click a bucket in the sidebar; verify the context menu contains Open, Pin or Unpin, and Delete bucket.
- [ ] Create a bucket in a region other than us-east-1 with New bucket; verify it appears in the sidebar without a manual refresh and is created in the connection region.
- [ ] Create a bucket in us-east-1 whose name you already own; verify the result is the expected one for an owned bucket and the dialog shows a clear message if it is rejected.
- [ ] Delete a non-empty bucket from the sidebar context menu; verify the dialog shows "Bucket is not empty" and the bucket stays in the list.
- [ ] Title bar overlay on X11 and on Wayland: controls clickable, drag works, and the overlay color follows a theme switch.
- [ ] macOS traffic lights centered in the 44 px toolbar. If they are not, set trafficLightPosition. This check is unverified because there was no darwin host.
- [ ] Switching between light and dark while the app runs. Visually check selected rows, dialogs, the sidebar, the toolbar, Quick Look, and the grid in both themes.
- [ ] Quick Look playback of video and audio. Space closes Quick Look even when the video is focused; this behavior follows the deliberate Finder parity decision.
- [ ] Grid thumbnails on a large prefix of 1,000 or more objects: smooth scrolling, no request storm, and icons for files that are not images or are over 5 MiB.
- [ ] The command palette: Ctrl+K or Cmd+K, bucket switching, actions, and focus return.
- [ ] The search status box overlays the first table rows and cannot be dismissed until the next search. Accept it, or file a follow-up.
- [ ] In the New folder and Rename dialogs, validation messages now appear under the field instead of in the top banner, while server errors still use the banner. Sign off on this.
