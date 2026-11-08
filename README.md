# Photos Sponge

A WXT Chrome extension for quickly triaging Google Photos on desktop.

Open Google Photos' Photos tab. The panel starts with the latest photo and
continues towards older photos, loading the timeline as you go. Click the
extension icon to hide the panel and pause, or reopen it to resume.

Choose **Start from** to begin at Now or a previous month. A month sets the
starting point; review continues through earlier months without stopping.
Months without photos start at the next older photo.

- `Y` to keep the current picture
- `N` to mark it for trash
- `U` to undo the previous uncommitted choice
- `Enter` to move marked photos to trash, then confirm in Google Photos

Pressing `N` selects the photo in Google Photos. Press `Enter` whenever you
want to move the current selection to trash. Cancel to preserve your place
and selection. The Sponge panel hides while Google's confirmation is pending
and returns when the operation finishes or is cancelled.
After confirmation and the selection toolbar clearing, review
continues at the next undecided photo. Undo stops at that committed operation.
If the trash action is unavailable, use Google Photos' own toolbar.

Hiding and reopening the panel with the extension icon preserves the current review within this tab. Reloading the
page or extension starts a new session. Clear any existing Google Photos
selection before starting a session or choosing another starting point.
If loading fails, the panel preserves your decisions. Hide and reopen it with the extension icon to retry.

Videos show a **Play video** button over their thumbnail. Click to load and play
in the panel with native playback controls. Advancing or hiding the panel stops
playback; returning to a video waits for another click. A playback failure offers
Retry video and leaves Keep, Trash, and Undo available.

## Develop

Sign into Google once using the persistent development profile, then close that
Chrome window before starting WXT:

```sh
bun run dev
```

## Build

```sh
bun run check
bun run test
bun run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome.

Browser tests use a separate headless Chrome profile and local photo fixtures.
Set `CHROME_BIN` if Chrome is installed at a different path.

## Structure

- `entrypoints/photos.content/` contains the Svelte panel and its WXT bootstrap.
- `src/photos/review-controller.ts` owns the typed review workflow.
- `src/photos/photo-timeline.ts` loads overlapping sections of the timeline
  and finds a starting month.
- `src/photos/google-photos.ts` isolates Google Photos DOM selectors and
  actions.
- `src/photos/google-photos-trash.ts` opens and observes native trash confirmation.
- `entrypoints/background.ts` toggles the panel when the toolbar icon is clicked.

## Notes

Google Photos does not expose a stable public DOM contract. This extension uses
conservative DOM heuristics and leaves deletion to Google Photos' own interface.
Date jumps recognize English and French photo labels. See
[continuous review experiments](docs/continuous-review.md) for the tested
approaches and verification limits.
