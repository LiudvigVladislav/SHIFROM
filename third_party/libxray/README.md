# libXray: provenance and licences

The Android app embeds one Go library, built from
[XTLS/libXray](https://github.com/XTLS/libXray) with `gomobile bind`. It is
vendored in two parts:

- `shared/core/xray/src/androidMain/libs/libXray.jar`, the Java bindings;
- `shared/core/xray/src/androidMain/jniLibs/<abi>/libgojni.so`, the native
  library, for `arm64-v8a`, `armeabi-v7a`, `x86` and `x86_64`.

SHIFROM does not modify any of the source code compiled into it.

## Provenance

| | |
|---|---|
| Vendored in | commit `0c157289e8ec` (2026-05-06) |
| Built by | `.github/workflows/build-libxray.yml`, run 25448646675 (2026-05-06), Go 1.26.2, NDK r27c |
| libXray | `main` at [`452c02e3caef3aa628bb3b812dc8d41024a90207`](https://github.com/XTLS/libXray/tree/452c02e3caef3aa628bb3b812dc8d41024a90207) (2026-05-04), **reconstructed indirectly, not recorded** — see below |
| Xray-core | [`v1.260327.0`](https://pkg.go.dev/github.com/xtls/xray-core@v1.260327.0) (release v26.3.27, commit `d2758a023cd7`) |

The run was started with the default ref, `main`, and its log has since expired,
so the libXray commit is reconstructed rather than recorded: it is the head of
`main` on the build date, and what the binary records matches it.
`go version -m libgojni.so` lists Xray-core `v1.260327.0` and the dependency
versions pinned by that commit's `go.mod` (a few earlier April commits pin the
same versions; the licences are the same). Run the same command to see the full
module list. All four ABIs embed the same modules.

## Licences

`licenses/` holds the licence, notice and patent files of every module compiled
into `libgojni.so`, copied verbatim from the exact versions in the table.
`sing`, `sing-shadowsocks` and `juju/ratelimit` ship only a short GPLv3 or
LGPLv3 notice; both licences require a copy of the GPL itself, so the script
adds the full text (`GPL-3.0.txt`, from gnu.org) to those directories as
`COPYING-GPL-3.0.txt`.
`collect-licenses.sh` regenerates the directory from the binary:

```bash
third_party/libxray/collect-licenses.sh <libXray commit SHA>
```

| Module | Version | Licence |
|---|---|---|
| github.com/xtls/libxray | `452c02e3caef` | MIT |
| github.com/xtls/xray-core | v1.260327.0 | MPL-2.0 |
| github.com/xtls/reality | v0.0.0-20260322125925-9234c772ba8f | MPL-2.0; Go-derived files BSD-3-Clause |
| github.com/andybalholm/brotli | v1.0.6 | MIT |
| github.com/apernet/quic-go | v0.59.1-0.20260217092621-db4786c77a22 | MIT |
| github.com/cloudflare/circl | v1.6.3 | BSD-3-Clause |
| github.com/ghodss/yaml | v1.0.1-0.20220118164431-d8423dcdf344 | MIT; Go-derived files BSD-3-Clause |
| github.com/google/btree | v1.1.3 | Apache-2.0 |
| github.com/gorilla/websocket | v1.5.3 | BSD-2-Clause |
| github.com/juju/ratelimit | v1.0.2 | LGPL-3.0 with a static and dynamic linking exception |
| github.com/klauspost/compress | v1.17.4 | BSD-3-Clause, Apache-2.0 and MIT, per file |
| github.com/klauspost/cpuid/v2 | v2.3.0 | MIT |
| github.com/miekg/dns | v1.1.72 | BSD-3-Clause |
| github.com/pelletier/go-toml | v1.9.5 | MIT; two files Apache-2.0 |
| github.com/pires/go-proxyproto | v0.11.0 | Apache-2.0 |
| github.com/quic-go/qpack | v0.6.0 | MIT |
| github.com/refraction-networking/utls | v1.8.3-0.20260301010127-aa6edf4b11af | BSD-3-Clause |
| github.com/sagernet/sing | v0.5.1 | GPL-3.0-or-later |
| github.com/sagernet/sing-shadowsocks | v0.2.7 | GPL-3.0-or-later |
| go4.org/netipx | v0.0.0-20231129151722-fdeea329fbba | BSD-3-Clause |
| golang.org/x/crypto | v0.50.0 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/exp | v0.0.0-20240719175910-8a7402abbf56 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/mobile | v0.0.0-20260410095206-2cfb76559b7b | BSD-3-Clause, with PATENTS grant |
| golang.org/x/net | v0.53.0 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/sync | v0.20.0 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/sys | v0.43.0 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/text | v0.36.0 | BSD-3-Clause, with PATENTS grant |
| golang.org/x/time | v0.15.0 | BSD-3-Clause, with PATENTS grant |
| golang.zx2c4.com/wireguard | v0.0.0-20250521234502-f333402bd9cb | MIT |
| google.golang.org/genproto/googleapis/rpc | v0.0.0-20260427160629-7cedc36a6bc4 | Apache-2.0 |
| google.golang.org/grpc | v1.80.0 | Apache-2.0 |
| google.golang.org/protobuf | v1.36.11 | BSD-3-Clause, with PATENTS grant |
| gopkg.in/yaml.v2 | v2.4.0 | Apache-2.0; libyaml-derived files MIT |
| gopkg.in/yaml.v3 | v3.0.1 | MIT and Apache-2.0 |
| gvisor.dev/gvisor | v0.0.0-20260122175437-89a5d21be8f0 | Apache-2.0; some files BSD-3-Clause |
| lukechampine.com/blake3 | v1.4.1 | MIT |

### Xray-core and REALITY under MPL-2.0

The `LICENSE` files of Xray-core and REALITY are the full text of MPL-2.0. That
text contains Exhibit B, the "Incompatible With Secondary Licenses" notice, as a
template. At the versions above, no source file attaches it. As Mozilla's
[MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/) (Q25) explains, the
appendix being present in the licence text does not by itself make code
incompatible with secondary licenses.

MPL-2.0 is file-level copyleft. The files of Xray-core and REALITY stay under
MPL-2.0 inside the app, and their source code at the exact versions above is
available upstream:

- https://github.com/XTLS/Xray-core/tree/d2758a023cd7f4174a5a5fa4ff66e487d4342ba0
- https://github.com/XTLS/REALITY/tree/9234c772ba8f181f31c3e81dc2b4177322e5a9a9

It is also available from the Go module proxy, and on request from
legal@shifrom.com.

## When libXray is refreshed

Vendor the new build as described in
`shared/core/xray/src/androidMain/libs/README.md`. Then run
`collect-licenses.sh` with the libXray commit that was built, update the
provenance and module tables above, and update the Xray entries in `NOTICE`.
