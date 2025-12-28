# SWAP UI (GitHub Pages)

This is a clean, glassmorphic, centered SWAP interface designed for GitHub Pages.

## Files
- index.html
- styles.css
- app.js
- foods.json (optional offline fallback; can be replaced with your real foods list)
- assets/hero.jpg (replace with your own image)

## Hook up your backend (optional but recommended)
Open `app.js` and set:

```js
const API_BASE = "YOUR_APPS_SCRIPT_EXEC_URL";
```

Your Apps Script can expose any of these routes (the UI auto-tries multiple):
- `?action=search&q=chicken`  (returns `{foods:[...]}` or `[...]`)
- `?action=swaps&foodId=...&portion=...&unit=...&mode=strict|flex` (returns `{swaps:[...]}` or `[...]`)

## Run
Upload to GitHub, enable Pages, done.

## Footer
The footer includes a “Powered by MonkVee” link as requested.
