# Photos Sponge

A WXT Chrome extension for quickly triaging Google Photos on desktop.

Open Google Photos, scroll to a month, choose that month from the floating panel, then press:

- `Y` to keep the current picture
- `N` to mark it for trash
- `U` to undo the previous choice
- `Esc` to stop without changing Google Photos

The extension does not delete as you go. It marks photos first, then asks for confirmation before it selects the marked photos and starts Google Photos' trash action.

## Develop

```sh
npm install
npm run dev:chrome
```

## Build

```sh
npm run build
```

Load `.output/chrome-mv3` as an unpacked extension in Chrome.

## Notes

Google Photos does not expose a stable public DOM contract. This extension uses conservative DOM heuristics and refuses to delete when it cannot find selection controls. Review a small month first before using it on a large library.
