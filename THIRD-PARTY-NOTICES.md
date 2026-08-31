# Third-party notices

This file describes separately distributed runtime components. It does not replace the license files shipped beside those components.

## FFmpeg and ffprobe

The Windows desktop package includes `ffmpeg.exe` and `ffprobe.exe` as separate command-line programs. They are obtained from the `yt-dlp/FFmpeg-Builds` project and are not linked into the Fengsha Video Learning application.

- Binary distribution: `ffmpeg-master-latest-win64-gpl.zip`
- Distribution page: <https://github.com/yt-dlp/FFmpeg-Builds/releases/tag/latest>
- Distribution SHA-256 at the 2026-08-30 release: `c547e335be45fe92088a8d9343663f1878df58063d1e64307906d6a72deb0a15`
- FFmpeg version: `N-126314-g3386acd2f9-20260829`
- FFmpeg source revision: <https://github.com/FFmpeg/FFmpeg/commit/3386acd2f9>
- Build recipes and dependency sources: <https://github.com/yt-dlp/FFmpeg-Builds>
- Packaged `ffmpeg.exe` SHA-256: `d0b31d397e9c43fb4186b96202910c9adb9636222b849b0000020e84b1e8695f`
- Packaged `ffprobe.exe` SHA-256: `36f5a042e28bb37bcfe9335ccaf697e829b4054c311673c52a99e7d6735c03f7`

The bundled build reports `--enable-gpl --enable-version3` and is distributed under GNU GPL version 3. The complete GPL text from the downloaded FFmpeg bundle is installed as `resources/FFMPEG-LICENSE.txt`.

For at least three years after a binary release, the repository owner offers the complete corresponding source used for that binary, including the build scripts needed to recreate it, in a machine-readable form. Request it through <https://github.com/123225073/Video_Study/issues>. No charge will be made beyond reasonable transfer costs.

The FFmpeg project and the included libraries retain their respective copyrights and licenses. See the source and build-recipe links above for component-level notices.

## Node.js runtime

The desktop package includes the official Node.js runtime as a separate executable used by yt-dlp's JavaScript challenge solver. It is not linked into the Fengsha Video Learning application.

- Node.js version: `v22.22.3` (Maintenance LTS)
- Official archive: `node-v22.22.3-win-x64.zip`
- Official distribution page: <https://nodejs.org/download/release/v22.22.3/>
- Archive SHA-256: `6c8d54f635feff4df76c2ca80f45332eb2ff57d25226edce36592e51a177ee33`
- Packaged `node.exe` SHA-256: `780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b`
- Source tag: <https://github.com/nodejs/node/tree/v22.22.3>

Node.js is distributed under the MIT license and includes externally maintained components under their respective licenses. The complete `LICENSE` file taken from the same verified official archive is installed beside the binary as `resources/node/LICENSE`.
