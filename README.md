# Photos Sponge

A WXT Chrome extension for quickly triaging Google Photos on desktop.

Open Google Photos, scroll to a month, choose that month from the floating
panel, then press. Click the extension icon to show or hide the panel:

- `Y` to keep the current picture
- `N` to mark it for trash
- `U` to undo the previous choice
- `Esc` to stop without changing Google Photos

Pressing `N` selects the photo in Google Photos. When the review is complete,
use Google Photos' own toolbar to move the selection to trash.

## Develop

Sign into Google once using the persistent development profile, then close that
Chrome window before starting WXT:

```sh
bun run dev
```

## Build

```sh
bun run check
bun run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome.

## Structure

- `entrypoints/photos.content/` contains the Svelte panel and its WXT bootstrap.
- `src/photos/review-controller.ts` owns the typed review workflow.
- `src/photos/google-photos.ts` isolates Google Photos DOM selectors and
  actions.
- `entrypoints/background.ts` toggles the panel when the toolbar icon is clicked.

## Notes

Google Photos does not expose a stable public DOM contract. This extension uses
conservative DOM heuristics and leaves deletion to Google Photos' own interface.
