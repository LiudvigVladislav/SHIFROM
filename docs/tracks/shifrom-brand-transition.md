# SHIFROM naming transition

## Goal

I am changing the messenger's public name to SHIFROM following a trade-name
conflict. This is a naming decision, not a finding of trademark infringement
or a statement that the new name has completed independent legal clearance.

## Scope

I am updating current Android display copy in English and Russian, the
repository's public entry points, issue templates, active documentation,
site sources, and legal/funding display names. The GitHub repository has
been renamed without changing its owner or repository identity.

I am preparing this change as a draft PR. I will not merge or deploy it
without separate approval. No new release or installed-device update is
part of this draft.

## Compatibility boundaries

I am retaining the Android application ID, package/component names, signing
configuration, database and preference names, keystore aliases, QR/invite
payloads, notification IDs, cryptographic domain separators and wire fields.
These are compatibility contracts, not current marketing copy.

I am updating public website/legal links to `shifrom.com` and existing contact
aliases to `@shifrom.com`, following the owner's completed domain/mail migration.
Service endpoints, invite hosts, donation destinations and the Codeberg mirror
remain unchanged. Willen LLC remains the legal entity. Existing filenames,
resource IDs and article slugs remain where links or build/deployment instructions
depend on them.

I am preserving historical releases, append-only journal entries, dated
audits and verification evidence. I am not modifying accepted design
goldens, crypto, transport, persistence, server configuration or payment
terms as a side effect of rebranding.

## Acceptance

- Current display names and canonical GitHub links use SHIFROM.
- English/Russian resource and focused host tests pass.
- Artwork is copied byte for byte from the supplied brand kit; bindings are
  recorded in `docs/branding/shifrom-assets.json`.
- The patch contains branding and public-contact substitutions, focused brand
  regression tests and this documented transition.
- Installation, protocol, persistence and service-address invariants
  remain unchanged.
- The publication stays a draft; no merge, deployment or device operation
  occurs.

The carrier-specific transport smoke gate does not apply: this patch does
not change route selection, reconnect lifecycle, probes, or network I/O.
Host validation does not prove an installed in-place upgrade.

## Supplied inputs and deployment boundary

The owner supplied `shifrom-brand-kit` on 2026-10-08 and reported the website
and corporate email migration complete. I integrated those exact images and
the existing contact aliases, without creating substitute artwork or sending
email. Mail delivery has not been independently tested in this draft.

Read-only checks on 2026-10-08 returned HTTP 200 for `https://shifrom.com/`
and all four English/Russian legal routes. However, the homepage response
still contained PHANTOM, old canonical links and old artwork. Domain
reachability is therefore verified; full publication of the new branding is
not. These source changes require a separately approved deployment.

Accepted visual goldens remain untouched. I am not presenting host resource
tests as approval of new screenshots or an installed in-place upgrade.

## Donation-channel follow-up

I am retaining the currently published donation destinations until replacement
pages or receiving addresses are supplied and verified. Creating payment
accounts, changing payout settings, generating wallet secrets and moving funds
are not part of this branding draft. A name change alone does not require a
new cryptocurrency address.

New provider pages and any selected public receiving addresses must be checked
as one coordinated change across `funding.json`, `.github/FUNDING.yml`, the
README and both donation pages. I will not substitute an unverified URL or
address, remove working channels, or claim that this migration is complete.

## Parking Conditions

I will stop if a branding edit requires changing identity, signing,
storage, protocol, operational endpoints or an unapproved external account.

## Checkpoint

The development/call-validation work is paused. I am using a clean branch
from master `1d47e58cd9ad97dad8837f316fa106d32a9a4b9f`; accumulated unrelated
development changes are not included in this draft.
