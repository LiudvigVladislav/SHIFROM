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

I am keeping the operating website, service endpoints, email addresses,
donation destinations and Codeberg mirror unchanged. Willen LLC remains the
legal entity. Existing filenames and article slugs remain where links or
build/deployment instructions depend on them.

I am preserving historical releases, append-only journal entries, dated
audits and verification evidence. I am not modifying accepted design
goldens, crypto, transport, persistence, server configuration or payment
terms as a side effect of rebranding.

## Acceptance

- Current display names and canonical GitHub links use SHIFROM.
- English/Russian resource and focused host tests pass.
- The patch contains naming-only substitutions, except the focused brand
  regression tests and this documented transition.
- Installation, protocol, persistence and operating-address invariants
  remain unchanged.
- The publication stays a draft; no merge, deployment or device operation
  occurs.

The carrier-specific transport smoke gate does not apply: this patch does
not change route selection, reconnect lifecycle, probes, or network I/O.
Host validation does not prove an installed in-place upgrade.

## Pending inputs

The replacement logo is pending. I have not invented new artwork or
re-recorded screenshots with a substitute. `shifrom.com` is planned but not
yet activated; email/domain migration is a later, separately verified step.

## Parking Conditions

I will stop if a branding edit requires changing identity, signing,
storage, protocol, operational endpoints or an unapproved external account.

## Checkpoint

The development/call-validation work is paused. I am using a clean branch
from master `1d47e58cd9ad97dad8837f316fa106d32a9a4b9f`; accumulated unrelated
development changes are not included in this draft.
