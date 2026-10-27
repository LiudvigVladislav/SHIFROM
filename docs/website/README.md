# SHIFROM Website

Static HTML/CSS/JS for `https://shifrom.com/`, with six pages in English
and six corresponding Russian pages under `/ru/`. There is no build step.

The published files live in `site/` and nothing else belongs there: this
document is kept in `docs/website/` and the preview tooling in
`tooling/site-preview/`, so neither is ever served with the site.

## Source Of Truth

Edit the twelve HTML files in `site/` and the shared files under `site/static/` directly.
Apply shared changes to all twelve pages and content changes to both languages.

- `static/css/`: `base.css` (every page) plus one stylesheet per page.
- `static/js/`: ES modules. `nav.js` runs on every page; `main.js` drives the
  home page and `scenes/`; `pages/` holds the other pages' controllers and scenes.
  One script serves both languages and reads `<html lang>`.
- `static/img/<page>/`: the designed stills shown without WebGL, with reduced
  motion, and before a scene starts.
- `static/vendor/three/`: three.js r186 (MIT, `LICENSE`), only `three.module.js`,
  `three.core.js` and the addons the scripts import, each minified with esbuild
  (ESM, exports unchanged). Do not edit these files; regenerate them when an
  import changes. The pages' import map has one exact entry per imported addon.

Every reference to a file under `static/` (HTML, CSS `url()`, module imports
and the import map) carries `?v=` with the first 8 hex digits of that file's
SHA-256, so a changed file always gets a new URL and an unchanged one keeps
its URL. A file is always referenced by one URL, so each module loads once.
After editing a file, update its version wherever it is referenced; those files
change too, so their versions change in turn. `node --test tooling/site-preview/preview.test.mjs`
fails on a stale version. The brand files keep the queries listed below; the
wordmark and the social image are referenced without one, as before.

Every page reads completely without JavaScript or WebGL: the 3D scenes are
progressive enhancements over the stills.

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
asset paths remain available. Fonts are self-hosted under `/static/fonts/` with their licences:
Unbounded and Onest (variable, Latin and Cyrillic subsets) and JetBrains Mono
500 (Latin). The earlier Inter, Geist and JetBrains Mono files stay at their
old URLs for pages still in caches; the current pages do not load them.
There are no Google Fonts or other font-CDN requests, and the
pages make no third-party requests at all.

Use `/static/` for website assets. `/assets/` is reserved and must not be used
for website files.

## Languages And Navigation

EN/RU switching uses real links between corresponding pages, not JavaScript,
browser-language detection, local storage, or inline content swapping.
Each page has a self-canonical URL and reciprocal `en`, `ru`, and `x-default`
hreflang links. `sitemap.xml` lists the same twelve URLs and alternate pairs.

The phone menu is a native `<details>` element: it works without JavaScript,
exposes its expanded state, keeps collapsed links out of keyboard focus, and
`nav.js` closes it on Escape, outside activation, or after a link is chosen.
Navigation and page content remain available when JavaScript is disabled.

## Local Preview

From the repository root, with Node.js installed:

```sh
node tooling/site-preview/preview.mjs
```

Open `http://127.0.0.1:4176/` or `http://127.0.0.1:4176/ru/`.
Set `PORT` to choose another port. The preview binds only to localhost, disables
caching, and mirrors the domain's other public routes for testing.
It is a development tool, not a production server.

Run the preview's dependency-free HTTP regression checks with:

```sh
node --test tooling/site-preview/preview.test.mjs
```

The tests use an ephemeral localhost port and stop their own preview process.

Before publication, check all twelve pages at desktop and mobile widths,
navigation with keyboard and without JavaScript, image/font loading, and
donation copying on both successful and denied clipboard operations.

## Publication

Repository changes do not publish the website. Publishing is a separate,
approved step that replaces only the files of `site/` and leaves every other
public resource of the domain untouched. Verify the live pages afterwards.

The legacy Liberapay and Buy Me a Coffee URLs and existing cryptocurrency
addresses remain unchanged until verified replacements are supplied.
Renaming the product is not authorization to create wallets or move funds.

The dated [website review and donation-link audit](../branding/SHIFROM-WEBSITE-REVIEW.md)
records which destinations still need account-level rebranding. Buy Me a Coffee
documents changing an existing page URL; do not assume a new account is needed.
