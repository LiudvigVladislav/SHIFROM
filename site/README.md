# SHIFROM Website

Static HTML/CSS/JS for `https://shifrom.com/`, with six pages in English
and six corresponding Russian pages under `/ru/`. There is no build step.

## Source Of Truth

Edit the twelve HTML files directly. Each embeds its styles and interactions.
Apply shared changes to all twelve pages and content changes to both languages.
`styles.css` and `site.js` are reference copies, not runtime dependencies.
The main eight pages use the full interaction script; the four engineering
pages use only its navigation portion.

| Page | English | Russian |
| --- | --- | --- |
| Home | `/` | `/ru/` |
| About | `/about.html` | `/ru/about.html` |
| Roadmap | `/roadmap.html` | `/ru/roadmap.html` |
| Support | `/donate.html` | `/ru/donate.html` |
| Engineering | `/writeups/` | `/ru/writeups/` |
| Field report | `/writeups/how-phantom-survives-dpi.html` | `/ru/writeups/how-phantom-survives-dpi.html` |

The existing article slug is retained so previously shared links keep working.
It is not the current product name.

## Branding And Assets

The approved SHIFROM artwork is copied without redrawing or recompression.
`docs/branding/shifrom-assets.json` binds the supplied files by SHA-256.

- `/static/favicon.png`: navigation and browser icon, 192 x 192.
- `/static/logo-mark.png`: home-page mark, 1024 x 1024.
- `/static/shifrom-wordmark-white.png`: supplied white wordmark, 781 x 119.
- `/static/apple-touch-icon.png`: Apple touch icon, 180 x 180.
- `/static/shifrom-social-132f0f6a.png`: owner-supplied social image with text,
  1774 x 887. Every page uses this URL in Open Graph and Twitter metadata.
- `/static/og-image.png`: earlier 1200 x 630 image retained for compatibility.

The new social image has a distinct URL to avoid reusing an old cached preview.
Logo/icon URLs carry a content-hash version query for the same reason. Existing
asset paths remain available. Fonts are self-hosted under `/static/fonts/`:
Inter and JetBrains Mono include Latin and Cyrillic; Geist falls back to Inter
for Cyrillic. There are no Google Fonts or other font-CDN requests.

Use `/static/` for website assets. `/assets/` is reserved for legal-page assets
by the existing Caddy routing.

## Languages And Navigation

EN/RU switching uses real links between corresponding pages, not JavaScript,
browser-language detection, local storage, or inline content swapping.
Each page has a self-canonical URL and reciprocal `en`, `ru`, and `x-default`
hreflang links. `sitemap.xml` lists the same twelve URLs and alternate pairs.

The mobile menu declares its expanded state, excludes collapsed links from
keyboard focus, closes on Escape or outside activation, and adapts on resize.
Navigation and page content remain available when JavaScript is disabled.

## Local Preview

From the repository root, with Node.js installed:

```sh
node site/tools/preview.mjs
```

Open `http://127.0.0.1:4176/` or `http://127.0.0.1:4176/ru/`.
Set `PORT` to choose another port. The preview binds only to localhost, disables
caching, and mirrors the existing legal, funding, and Android-link routes.
It is a development tool, not a production server.

Run the preview's dependency-free HTTP regression checks with:

```sh
node --test site/tools/preview.test.mjs
```

The tests use an ephemeral localhost port and stop their own preview process.

Before publication, check all twelve pages at desktop and mobile widths,
navigation with keyboard and without JavaScript, image/font loading, and
donation copying on both successful and denied clipboard operations.

## Publication Boundary

Repository changes do not publish the website. Verify the actual production
vhost, mounted paths, file versions, and Cloudflare cache policy first.
The checked-in deployment still contains legacy host/path names; do not infer
the live `shifrom.com` setup from it, replace relay hostnames, pull unrelated
application changes into production, or recreate containers just to publish
static pages. Deployment requires a separately approved, bounded operation.

The legacy installation used `/home/phantom/Phantom/site` mounted read-only
as `/srv/landing`. Its root `funding.json` and well-known files were separate
single-file bind mounts; replacing their inode does not necessarily update
the container view. A static-site publication must preserve these boundaries.

Preserve the following separately served resources and verify them after any
approved deployment:

- `/funding.json` and `/.well-known/funding-manifest-urls`.
- `/.well-known/assetlinks.json`, including Android signing fingerprints.
- `/terms`, `/terms/ru`, `/privacy`, `/privacy/ru`, and `/assets/*`.
- ACME challenge handling and existing certificates.
- Relay, push, bridge, TURN, and onion endpoints and their running containers.

The legacy Liberapay and Buy Me a Coffee URLs and existing cryptocurrency
addresses remain unchanged until verified replacements are supplied.
Renaming the product is not authorization to create wallets or move funds.

The dated [website review and donation-link audit](../docs/branding/SHIFROM-WEBSITE-REVIEW.md)
records which destinations still need account-level rebranding. Buy Me a Coffee
documents changing an existing page URL; do not assume a new account is needed.
