# Validation

- Navigation security tests: 2 passing, covering allowed Sonos HTTPS origins, lookalike domains, URL user-info tricks, and disallowed protocols.
- Development app launched on macOS: Sonos reached `https://login.sonos.com/`, titled “Sign in | Sonos”.
- 100 MilkDrop presets loaded with no reported renderer errors.
- Preset next, spectrum mode, expand, Escape restore, hide/show: exercised in the running app.
- Apple Silicon `.app` built successfully with bundled production dependencies.

Pending: signed-in Sonos playback, grouping, queue editing, search, volume, service access, session persistence after actual login, external-provider authentication, and physical microphone/loopback capture. These require the user's account and devices; no claim of full Sonos feature verification is made.

Packaged app verification also passed: official Sonos email/password form rendered; all 100 presets loaded; a simulated audio device connected successfully and Stop Audio Input returned to ambient mode; expand/restore and hide/show worked in the packaged build. No physical microphone was used in this check.

## Main and mini visualizers — September 5

- Fixed output-canvas sizing in both renderers; Butterchurn's internal resize alone left the output at the browser's default 300×150 resolution.
- Hidden mini views preserve their last drawable dimensions; unchanged dimensions do not reallocate textures.
- Pending microphone requests are invalidated when a visualizer is hidden or closed; any late-arriving tracks are immediately stopped.
- Closing the mini renderer stops its audio input and releases its AudioContext. Enabling its mic also shows its visualizer.
- Eight automated tests pass, including both renderers' pending-capture cancellation and active-capture cleanup.
- Verified in the running Sonos Amp development app using its existing signed-in Sonos session: main MilkDrop renders in expanded view; live spectrum shows nonzero audio levels; mini MilkDrop renders with MIC ON; hiding mini visuals resets MIC OFF; Sonos's actual now-playing controls remain present.
- Physical default audio input was successfully connected in both windows. These visuals respond to that input, not a direct digital feed from Sonos.
