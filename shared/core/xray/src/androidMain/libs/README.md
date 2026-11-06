# libXray vendored artefacts

`libXray.jar` here, plus `libgojni.so` under `../jniLibs/<abi>/`, are the
unpacked contents of the `libXray.aar` produced by
`.github/workflows/build-libxray.yml`. They are vendored (committed) rather
than fetched at build time so a clean clone of SHIFROM compiles without an
out-of-band download.

## Why split, not a single .aar

AGP refuses to bundle a local `.aar` inside another AAR (`hasLocalAarDeps`
check), and every `:shared:core:*` module is itself an AAR. Splitting
libXray into its constituents (a thin Java wrapper jar plus the four-ABI
JNI library) sidesteps that restriction with no semantic change.

## How to refresh

When XTLS/libXray ships a release we want to pick up:

1. Trigger **Build libXray.aar** in GitHub Actions
   (`.github/workflows/build-libxray.yml`) — pass the desired tag/SHA via
   the `libxray_ref` input. Wait ~15 minutes for the run to succeed.
2. Download the `libXray-<ref>-<run>` artefact from the run page; it
   contains a single `libXray.aar`.
3. Unpack it into this repo:

   ```bash
   AAR=/path/to/libXray.aar
   unzip -o -q "$AAR" -d /tmp/libxray-unpack
   cp /tmp/libxray-unpack/classes.jar shared/core/xray/src/androidMain/libs/libXray.jar
   for abi in arm64-v8a armeabi-v7a x86 x86_64; do
       cp /tmp/libxray-unpack/jni/$abi/libgojni.so \
          shared/core/xray/src/androidMain/jniLibs/$abi/
   done
   ```

4. `./gradlew :shared:core:xray:assemble` to verify, then commit the
   updated artefacts in a single commit referencing the source SHA.
5. Refresh the licence files and provenance in `third_party/libxray/`
   (see its README) and the Xray entries in `NOTICE`.

## Provenance

Current build: libXray `main` at `452c02e3caef` (reconstructed indirectly;
Xray-core v1.260327.0 is recorded in the binary),
built by `gomobile bind` with NDK r27c and Go 1.26.2 on 2026-05-06, vendored
in commit `0c157289e8ec`. Exact versions, licences and how they were
established: `third_party/libxray/README.md`.
