const $ = id => document.getElementById(id);
$('restore').onclick = () => window.sonosAmp?.action('restore');

window.sonosAmp?.getRooms().then(({ rooms, active } = {}) => {
  if (!rooms?.length) return;
  $('room').replaceChildren(...rooms.map(name => new Option(name, name)));
  if (active && rooms.includes(active)) $('room').value = active;
}).catch(() => {});
$('room').onchange = () => { if ($('room').value) window.sonosAmp?.selectRoom($('room').value); };

let context, visualizer, presets = {}, names = [], index = 0, frame, lastChange = 0, on = false;
let stream, source, micOn = false, micStarting = false, captureGeneration = 0;

function selectPreset(i) {
  if (!visualizer || !names.length) return;
  index = ((i % names.length) + names.length) % names.length;
  try { visualizer.loadPreset(presets[names[index]], 2.5); } catch (error) { console.error('Preset failed to load:', names[index], error); }
  lastChange = performance.now();
}
function loadPreset(delta = 0) { selectPreset(index + delta); }
function resize() {
  visualizerUtils.resizeVisualizer($('milkdrop'), $('mini-visual'), visualizer);
}
function render(t) {
  try {
    if (on) {
      if (t - lastChange > 22000) loadPreset(1);
      visualizer?.render();
    }
  } catch (error) {
    console.error('Mini visualizer frame error, recovering on next preset:', error);
    try { loadPreset(1); } catch {}
  }
  frame = requestAnimationFrame(render);
}

try {
  context = new AudioContext();
  const engine = window.butterchurn.default || window.butterchurn;
  visualizer = engine.createVisualizer(context, $('milkdrop'), { width: 320, height: 160, pixelRatio: 1 });
  const pack = window.butterchurnPresets.default || window.butterchurnPresets;
  presets = pack.getPresets(); names = Object.keys(presets).sort();
  index = Math.max(0, names.findIndex(name => /flexi.*martin/i.test(name)));
  selectPreset(index);
  new ResizeObserver(resize).observe($('mini-visual'));
  frame = requestAnimationFrame(render);
} catch (error) { console.error('Mini visualizer could not start:', error); }

// Picks up whatever preset the main window is actually showing, so opening the mini
// visualizer feels like a continuation of it rather than a fresh, unrelated one. This is
// purely cosmetic (same preset name) — the two are still separate Butterchurn instances,
// each with its own independent audio capture below.
window.sonosAmp?.onInitPreset(name => {
  if (!name || !names.length) return;
  const i = names.indexOf(name);
  if (i >= 0) selectPreset(i);
});

// A real, independent mic capture for THIS window's visualizer — mini can't share the
// main window's audio graph (separate renderer process), so it needs its own, using the
// system default input device (no device picker here; use the main window for that).
function stopMic() {
  captureGeneration++;
  micOn = false;
  if (source) { visualizer?.disconnectAudio(source); source.disconnect(); source = null; }
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  $('mic-toggle').setAttribute('aria-pressed', false);
  $('mic-toggle').textContent = 'MIC OFF';
  $('mic-toggle').title = 'Audio input is off. Click to enable audio-reactive visuals.';
}
async function startMic() {
  if (micStarting) return;
  micStarting = true;
  $('mic-toggle').disabled = true;
  stopMic();
  const generation = captureGeneration;
  try {
    if (!context || !visualizer) throw new Error('Visualizer is unavailable');
    await context.resume();
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    if (generation !== captureGeneration) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    source = context.createMediaStreamSource(stream);
    visualizer.connectAudio(source);
    micOn = true;
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (generation === captureGeneration) stopMic(); });
    $('mic-toggle').setAttribute('aria-pressed', true);
    $('mic-toggle').textContent = '● MIC ON';
    $('mic-toggle').title = 'Audio input is active. Click to stop listening.';
  } catch (error) {
    if (generation !== captureGeneration) return;
    stopMic();
    $('mic-toggle').textContent = error.name === 'NotAllowedError' ? 'MIC BLOCKED' : 'MIC ERROR';
    $('mic-toggle').title = `${error.name}: ${error.message || 'microphone unavailable'}`;
  } finally { micStarting = false; $('mic-toggle').disabled = false; }
}
$('mic-toggle').onclick = () => { if (micOn) stopMic(); else { if (!on) $('vis-toggle').click(); startMic(); } };

$('vis-toggle').onclick = () => {
  on = !on;
  $('vis-toggle').setAttribute('aria-pressed', on);
  $('mini-visual').hidden = !on;
  window.sonosAmp?.action(on ? 'mini-vis-on' : 'mini-vis-off');
  if (on) resize();
  // No reason for the mic to keep listening once there's nothing visible to react to.
  else stopMic();
};

window.addEventListener('beforeunload', () => { cancelAnimationFrame(frame); stopMic(); context?.close(); });
