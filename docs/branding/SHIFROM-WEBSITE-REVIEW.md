# SHIFROM Website Review

I refreshed the existing bilingual website after the product's naming conflict and the transition to SHIFROM. The website change was reviewed and merged in [PR #426](https://github.com/LiudvigVladislav/SHIFROM/pull/426), then published separately on 8 October 2026 without restarting the relay. The visual checks below describe that website change, not a device acceptance test for the Android app.

## Visual Review

The homepage keeps the former centered composition with the approved SHIFROM mark, separate wordmark, divider and four badges. The approved social image is separate from the live page and is copied without alteration.

| Desktop | Mobile |
| --- | --- |
| ![English homepage at 1440 x 960](site-shifrom-home-desktop.png) | ![English homepage at 390 x 844](site-shifrom-home-mobile.png) |

I checked both homepages at 1440 x 960, 1366 x 768, 1920 x 1080, 390 x 844 and 320 x 740. Fonts and artwork load; hero content stays within the viewport, and the next section remains visible. These are responsive reference checks, not pixel-identical reproduction of an old screenshot with unknown browser zoom.

## Donation-Link Audit

Updated on 9 October 2026 after [PR #427](https://github.com/LiudvigVladislav/SHIFROM/pull/427) and the separate donation-page publication. I checked both rebranded public profiles without signing in. Opening a public profile does not prove that a payment or payout will succeed; neither was attempted.

| Destination | Observed state | Next step |
| --- | --- | --- |
| [Liberapay](https://liberapay.com/SHIFROM/) | Current SHIFROM profile and factual English description are public. | Branding and link migration complete; payment and payout capability not tested. |
| [Buy Me a Coffee](https://buymeacoffee.com/shifrom) | Current SHIFROM profile and factual English description are public; duplicated title fixed. | Branding and link migration complete; payment and payout capability not tested. |
| GitHub Sponsors | Existing `LiudvigVladislav` destination is retained. | Independently verify account and payout status before making an availability claim. |
| BTC, XMR and USDT ERC-20 addresses | EN/RU page values remain byte-identical to the prior repository version. | Keep current values until any replacement is verified. This comparison is not proof of key ownership or transaction capability. |

Buy Me a Coffee's [official setup guide](https://help.buymeacoffee.com/en/articles/10184401-how-to-set-up-your-buy-me-a-coffee-page) documents changing the URL through Settings -> My Page Link and updating previously shared links. Its [advanced-settings guide](https://help.buymeacoffee.com/en/articles/10202407-buy-me-a-coffee-advanced-settings-explained) explicitly covers rebranding the page URL. The existing accounts were retained; this migration did not change payment or payout settings.

Both public descriptions now distinguish current Android development builds from planned clients, describe necessary relay metadata and the unaudited custom protocol, and identify contributions as voluntary development support rather than investments or subscription purchases.

## Migration Boundary

The EN/RU support pages, README, GitHub Sponsor configuration and `funding.json` now point to the verified SHIFROM donation profiles. Publication confirmed all 12 EN/RU pages returned HTTP 200 and the public `funding.json` matched the merged repository bytes. The well-known pointer, channel identifiers and published cryptocurrency addresses were preserved. These checks did not prove key ownership, transaction capability or payout availability.

On 9 October I renamed the existing [Codeberg mirror](https://codeberg.org/VladislavLiudvig/SHIFROM), updated its description and website, and aligned GitHub's `CODEBERG_REPO_URL` variable. Read-only Git ref comparisons confirmed the same `master` and all three published tags before and after the rename. The former web URL redirects to the renamed repository. Current website mirror links are updated in this follow-up; publishing those link-only changes remains a separate step.

Do not treat a product rename as a reason to discard wallet keys or move funds. Application identity, signing, user data, relay hosts, legal pages, deployment configuration and historical article slugs are outside this follow-up. No new Android device validation, payment transaction, endpoint migration or relay restart is implied by the completed public branding work.
