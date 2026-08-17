# Self-hosted Inter font

These two `.woff2` files replace the `@import url('https://fonts.googleapis.com/...')`
that used to live at the top of `public/css/styles.css`.

Nexy needs to work fully offline and on firewalled/locked-down school networks. A
network `@import` for a stylesheet blocks CSS parsing until it resolves or times
out, and on some networks the fallback (`Arial`, already declared in
`styles.css`) would only kick in after a long stall.

## What's here

- `inter-latin.woff2` — Basic Latin + Latin-1 Supplement (covers English and, since
  Portuguese diacritics like ã õ ç á é í ó ú â ê ô live in the Latin-1 Supplement
  block, Portuguese too).
- `inter-latin-ext.woff2` — Latin Extended-A/B, for the rarer characters some
  other Latin-script languages need. Included for headroom; not strictly required
  for the app's current `en`/`pt` locales.

Both are variable fonts covering weights 400-700 in a single file each (that's
why `styles.css` declares `font-weight: 400 700` on each `@font-face`, rather
than one block per weight).

## How they were fetched

Downloaded directly from Google's own CDN (`fonts.gstatic.com`), i.e. the exact
bytes Google Fonts would have served the browser via the `@import`, just fetched
once at build time instead of on every page load:

```bash
curl -sL -A "Mozilla/5.0 ... Chrome/120.0 Safari/537.36" \
  -o inter.css "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
# inter.css lists one @font-face per (subset, weight) with a gstatic.com URL.
# Pick the "latin" and "latin-ext" subset URLs (they're identical across all four
# weights declared, since this family serves as a single variable-font file) and
# download those two woff2 URLs directly.
```

To refresh (e.g. a new Inter version), repeat the above and replace both files —
the `unicode-range` values in `styles.css` may also need updating if Google
changes how it splits subsets.
