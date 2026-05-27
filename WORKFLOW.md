# Codex + HyperFrames + Remotion Workflow

This repo now has a local video workflow that Codex can operate end to end.

## Capability Check

- Codex: available in this workspace for editing, running scripts, and verification.
- HyperFrames: installed as a dev dependency and wired to `video/hyperframes`.
- Remotion: installed as a dev dependency and wired to `src/remotion`.
- Node: requires Node 22+ for HyperFrames; this machine reports Node 24.15.0.
- FFmpeg: installed locally through `@ffmpeg-installer/ffmpeg`; HyperFrames scripts prepend the local binary path automatically.

## Scripts

- `npm.cmd run hf:doctor` checks the HyperFrames environment using local FFmpeg/FFprobe binaries.
- `npm.cmd run hf:lint` validates the HyperFrames source structure.
- `npm.cmd run hf:inspect` runs HyperFrames visual layout inspection.
- `npm.cmd run hf:preview` starts HyperFrames Studio at `http://localhost:3002/#project/hyperframes`.
- `npm.cmd run hf:render` renders a draft HyperFrames MP4 to `artifacts/hyperframes-codex-workflow.mp4`.
- `npm.cmd run remotion:studio` starts Remotion Studio with the cached local Chrome executable.
- `npm.cmd run remotion:still` renders a still frame to `artifacts/remotion-codex-workflow.png`.
- `npm.cmd run remotion:render` renders the Remotion MP4 to `artifacts/remotion-codex-workflow.mp4`.
- `npm.cmd run workflow:check` runs the core local check path.

Use `npm.cmd` on this Windows machine because PowerShell blocks the `npm.ps1` shim by policy.
