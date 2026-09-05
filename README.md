# Sonos Amp

A Mac desktop app with a Winamp-inspired receiver frame, the actual Sonos web player, and Butterchurn's MilkDrop visualizer. An independent project, not affiliated with Sonos or Winamp.

## Open the app

Open `dist/mac-arm64/Sonos Amp.app` on this Apple Silicon Mac. Sign in to Sonos inside the music panel. Your Sonos session is saved locally between launches. The build is local and unsigned, not a notarized public release.

## Use it

- Use the real Sonos panel for music, rooms, grouping, volume, queues, search, and settings wherever Sonos makes those controls available to your account in its web player.
- Pick a MilkDrop preset, move between presets, or enable automatic transitions every 22 seconds.
- Choose the classic spectrum analyzer for frequency bars.
- Enable audio reactivity and allow microphone access, then play Sonos music in the room. The input selector exposes available devices after permission is granted. A loopback device may also be selected if installed and supplied with audio.
- Stop Audio Input immediately stops microphone tracks. No audio is recorded, uploaded, or played back through this app.
- Expand the visualizer; press Escape to return. VIS hides or shows it. Reload reconnects the Sonos page. Open in Browser provides access in your normal browser if an authentication provider requires it; browser and app sessions are separate.

## Scope and limitations

This is a Winamp-inspired shell, not a complete pixel-perfect clone of Winamp. Sonos's interface inside the music panel remains its official web interface to preserve its functionality. It does not reproduce native Sonos features absent from play.sonos.com, and cannot promise every Sonos feature works before account-and-speaker testing. There are no fabricated tracks, rooms, or playback states.

Sonos speakers receive the audio stream, not this Mac. Visuals use ambient animation until audio input is enabled. Microphone synchronization is acoustic, not a bit-perfect feed from Sonos. The spectrum stays flat without input. MilkDrop is implemented through Butterchurn; legacy Winamp DLL visualization plugins are not supported.

Remote Sonos pages are sandboxed with no Node or local preload access. Only HTTPS Sonos hosts navigate within the player; other HTTPS links open the default browser. Microphone access belongs only to the local visualizer. A login flow requiring an external domain may need additional integration and validation.

## Development

Requires Node.js and pnpm.

```sh
pnpm install
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm package
```

If pnpm reports ignored optional lifecycle scripts, Electron's installer above installs its runtime explicitly. The app includes local copies of Butterchurn and its presets, with upstream licenses retained in packaged dependencies.

## Verification

See `VALIDATION.md` for checks performed and remaining account/device checks.

## References

- Sonos web player: https://play.sonos.com/
- Sonos Control API: https://docs.sonos.com/docs/control
- Butterchurn (MilkDrop implementation): https://github.com/jberg/butterchurn
- Electron WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
