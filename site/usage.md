---
title: Using the App
nav_order: 3
---

# Using the App
{: .no_toc }

1. TOC
{:toc}

## User Interface

- **Theme:** The application follows system light and dark mode automatically via `prefers-color-scheme` and `nativeTheme`. There is no in-app theme toggle.
- **Window Chrome:** The window uses a hidden title bar. On Linux and Windows, Electron title bar overlay controls render inside a 44 px toolbar with colors matching the active theme. On macOS, the toolbar reserves a left inset for the native traffic light controls.
- **View Modes:** The object browser supports both a virtualized list table and a virtualized grid view. The selected view mode persists in `localStorage` under key `s3-view-mode`.
- **Thumbnail Budget:** In grid view, thumbnails are loaded with a concurrency limit of 4 after scrolling pauses for 150 ms, restricted to image objects up to 5 MiB.
- **Command Palette:** Pressing `Ctrl + K` or `Cmd + K` opens a command palette for bucket navigation, breadcrumbs, and common actions.
- **Quick Look:** Pressing `Space` on an object opens a modal preview supporting video, audio, images, PDF, and text.

## Keyboard Shortcuts

### Object Browser (List and Grid Views)

- `ArrowUp` / `ArrowDown`: Move active row and selection up or down by one item in list view, or by one row in grid view.
- `Shift + ArrowUp` / `Shift + ArrowDown`: Extend selection up or down in list view, or by one row in grid view.
- `ArrowLeft` / `ArrowRight`: Move active item and selection left or right by one column in grid view.
- `Shift + ArrowLeft` / `Shift + ArrowRight`: Extend selection left or right in grid view.
- `PageUp` / `PageDown`: Move active item and selection up or down by one viewport page.
- `Home` / `End`: Move selection to the first or last item in the current prefix.
- `Ctrl + Space` / `Cmd + Space`: Toggle selection of the active item.
- `Ctrl + A` / `Cmd + A`: Select all items in the current view.
- `Escape`: Clear current selection.
- `Space`: Open Quick Look preview for the active or selected object.
- `Enter`: Open the selected folder or object. Active only when exactly one item is selected.
- `Alt + ArrowUp` / `Backspace`: Navigate to the parent folder.
- `Delete`: Delete the selected object, folder, or multi-selected objects. Deletion is blocked if multiple items are selected and any of them is a folder.
- `F2`: Rename or move the selected item. Active only when exactly one item is selected.
- `ContextMenu` / `Shift + F10`: Open the context menu for the active row.

Object browser shortcuts are disabled when focus is inside an `input`, `textarea`, or `select` element, or when a modal dialog is open.

### Quick Look Modal

- `Space`: Close Quick Look preview. Space closes the preview even when video or audio playback is focused.
- `Escape`: Close Quick Look preview.
- `ArrowLeft` / `ArrowUp`: Navigate to the previous object in the current listing.
- `ArrowRight` / `ArrowDown`: Navigate to the next object in the current listing.

Arrow navigation in Quick Look is ignored while focus is inside an editable input or media playback element.

### Command Palette

- `Ctrl + K` / `Cmd + K`: Open or close the command palette.
- `Escape`: Close the command palette and restore focus to the previous element.

## Context Menus

Context menus open on right-click or via `ContextMenu` / `Shift + F10`:

- **Object items:** Open, Open with system app, Download, Rename or move, and Delete.
- **Folder items:** Open, Rename folder, and Delete folder.
- **Multi-selection:** Delete N objects for multiple objects; disabled Delete when folders are included because folders cannot be multi-deleted.
- **Sidebar bucket items:** Open, Pin or Unpin, and Delete bucket. A New bucket button in the selected connection creates a bucket.
