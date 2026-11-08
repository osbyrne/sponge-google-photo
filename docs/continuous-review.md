# Continuous review

The reviewer follows the main Google Photos timeline from newer to older
photos. Months choose a starting position; they do not divide the session.
Decisions and the current position remain in memory until the tab or extension
reloads.

## Loading experiments

The following approaches were exercised against the signed-in Google Photos
web page on November 7, 2026. These checks only read metadata and scroll the
page. They did not select, unselect, or delete library items.

| Approach | Observation | Implementation choice |
| --- | --- | --- |
| Scroll the browser window | The photo grid uses its own scrolling container. Window scrolling did not advance it. | Find the scrollable ancestor of photo links. |
| Jump several screenfuls | Google recycles tiles, removing the overlap with the previous section. | Use large jumps only when finding an initial date, before there are pending selections. |
| Advance with overlapping grid sections | New photos appear while part of the previous section remains available. | Read the viewport, deduplicate by photo link, and advance by 60% of its height. |
| Click a native timeline month marker | A programmatic click did not navigate the timeline. | Avoid depending on Google's internal event wiring. |
| Find a date using scroll position and visible dates | Reached October within the main timeline, allowing subsequent review to continue into earlier months. | Expand a nearby search range, then narrow it using visible photo dates. |

Google can create a photo link before populating its accessible label. The
reader waits for visible tile metadata before collecting a batch, which avoids
adding incomplete tiles or changing their order as metadata arrives.

Thumbnail URLs can arrive after labels. Before showing each item, the reviewer
re-reads its tile by photo link and waits for its thumbnail, including at startup
and when taking an item from the queue. A missing preview stops advancement with
a retry message instead of keeping a cached item without an image.

## Position and selection

Photo identity comes from the photo link, independently of thumbnail URLs,
screen coordinates, and recycled DOM nodes. Each photo also records a scroll
position so Undo can bring its tile back into view. Selection resolves the
current tile by that link and uses its own checkbox, then verifies the state.

The panel is mounted outside the photo grid. Loading does not insert, remove,
or resize Google's tiles. Google owns grid geometry and native selection.

A failed load stops advancement and preserves decisions. Hide and reopen the panel with the extension icon to retry.
The reader reports the end only after reaching the bottom, observing rendered
photos, and allowing the grid to settle without more items or a loading indicator.
Date jumps stop with an explanation if photo dates cannot be read.

Enter opens Google's native trash confirmation during review. Cancellation
preserves the current photo and decisions. After user confirmation, dialog
dismissal, and selection clearing, the reviewer discards committed Undo history
and continues with the current undecided photo. It never clicks confirmation.

## Video playback

English `Video` and French `Vidéo` tile labels identify videos. For recognized
Google thumbnail hosts, the preview replaces the image sizing suffix with
`=dv`, retaining the account query parameters. The browser requests this URL
only after Play video is clicked. This uses the signed-in page's media access;
it does not require an API token, additional extension permissions, or opening
the native viewer.

The player has native controls and a 20-second initial playback timeout.
Errors restore the thumbnail with Retry video. Advancing, Undo, pausing,
confirmation, hiding, and unmounting release the media source. Focused video
controls retain native playback keys, including Enter, so they cannot trigger
the review's trash shortcut. Y, N, and U still work with the player focused.

Live checks on November 8, 2026 verified metadata from two library videos and
click-to-play in the compiled Svelte panel on the timeline, plus stopping and
reopening without autoplay. Google media URLs and tile labels are undocumented
web UI behavior; unsupported URLs and playback failures leave the review usable.

## Verification

`bun run test` runs local Chrome browser checks using the actual timeline
reader, controller, DOM selectors, and Svelte panel. A fixture recycles tiles,
delays metadata, persists selection outside rendered tiles, and models Google's
confirmation dialog. Checks cover chronological continuity, date starts, Undo,
mid-review commits, cancellation, failed loads, retry, keyboard guards, and UI
controls.

Video checks decode and play a generated three-second WebM fixture with video
and audio, exercise retry, and verify cleanup and review shortcuts. These checks
use Chrome's real clock over its debugging pipe because virtual time can outrun
media decoding. The isolated headless profile permits playback after synthetic
test clicks; the live panel check uses a browser click with normal media policy.

Live read-only checks verified chronological traversal, an October starting
point, Keep-only review, and pause/resume. Selection and trash behavior were
verified against local browser fixtures, without modifying the live library.
Google's DOM is undocumented; these observations are evidence for the inspected
page, rather than a guarantee across every account or future Google UI release.
