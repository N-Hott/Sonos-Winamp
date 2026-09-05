const $ = id => document.getElementById(id);
function bounds() { const r = $('player-slot').getBoundingClientRect(); window.sonosAmp?.bounds({x:r.x,y:r.y,width:r.width,height:r.height}); }
new ResizeObserver(bounds).observe($('player-slot'));
window.addEventListener('resize', bounds);
window.sonosAmp?.onStatus(message => $('player-status').textContent = message);
window.sonosAmp?.onRestore(() => bounds());
for (const action of ['home','reload','browser']) $(action).onclick = () => window.sonosAmp?.action(action);
// Mini mode always opens with its own visualizer off, so there's nothing here for the
// mic to react to until it's turned on there — no reason to leave it listening.
$('mini').onclick = () => { stop(); window.sonosAmp?.action('mini'); };
$('visual-toggle').onclick = () => {document.body.classList.remove('expanded'); $('expand').textContent = '⛶ EXPAND'; const hidden = document.body.classList.toggle('visual-hidden'); $('visual-toggle').setAttribute('aria-pressed', !hidden); if (hidden) stop(); bounds();};
$('expand').onclick = () => { const expanded = document.body.classList.toggle('expanded'); $('expand').textContent = expanded ? '⛶ RESTORE' : '⛶ EXPAND'; bounds(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') {document.body.classList.remove('expanded'); $('expand').textContent = '⛶ EXPAND'; bounds();} });
let context, visualizer, analyser, stream, source, frame, active = false, starting = false, captureGeneration = 0;
let presets = {}, names = [], index = 0, automatic = true, lastChange = performance.now();
const bars = new Uint8Array(128), waveform = new Uint8Array(256);
function loadPreset(delta = 0) { if (!visualizer || !names.length) return; index = (index + delta + names.length) % names.length; try { visualizer.loadPreset(presets[names[index]], 2.5); } catch (error) { console.error('Preset failed to load:', names[index], error); } $('preset').value = names[index]; lastChange = performance.now(); window.sonosAmp?.presetChanged(names[index]); }
function resize() {
  const rect = $('milkdrop').parentElement.getBoundingClientRect();
  const w = Math.max(1,Math.round(rect.width)), h = Math.max(1,Math.round(rect.height));
  visualizerUtils.resizeVisualizer($('milkdrop'), $('milkdrop').parentElement, visualizer);
  if ($('spectrum').width !== w) $('spectrum').width = w;
  if ($('spectrum').height !== h) $('spectrum').height = h;
}
function render(t) {
  try {
    if (automatic && t-lastChange > 22000) loadPreset(1);
    if (!document.body.classList.contains('visual-hidden')) {
      if ($('mode').value === 'milkdrop') visualizer?.render();
      else {
        const canvas = $('spectrum'), g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
        g.fillStyle = '#080d08'; g.fillRect(0,0,w,h);
        if (active) analyser.getByteFrequencyData(bars); else bars.fill(0);
        for (let i=0;i<48;i++) { const level = active ? bars[i*2]/255 : 0; const bh = level*(h-30); const gradient=g.createLinearGradient(0,h,0,0); gradient.addColorStop(0,'#8dd939');gradient.addColorStop(.65,'#e6dc55');gradient.addColorStop(1,'#eb694f');g.fillStyle=gradient;g.fillRect(i*w/48+2,h-bh-15,w/48-3,Math.max(2,bh)); }
        g.fillStyle='#080d0888';for(let y=0;y<h;y+=5)g.fillRect(0,y,w,2);
      }
    }
  } catch (error) {
    console.error('Visualizer frame error, recovering on next preset:', error);
    try { loadPreset(1); } catch {}
  }
  frame=requestAnimationFrame(render);
}
try {
  context = new AudioContext(); analyser = context.createAnalyser(); analyser.fftSize = 256;
  const engine = window.butterchurn.default || window.butterchurn;
  visualizer = engine.createVisualizer(context, $('milkdrop'), {width:340,height:220,pixelRatio:1});
  const pack = window.butterchurnPresets.default || window.butterchurnPresets;
  presets = pack.getPresets(); names = Object.keys(presets).sort();
  names.forEach(name => $('preset').add(new Option(name,name)));
  index = Math.max(0,names.findIndex(name => /flexi.*martin/i.test(name)));
  try { loadPreset(); } catch (error) { console.error('Initial preset failed to load, advancing:', error); index = (index + 1) % names.length; try { loadPreset(); } catch {} }
  resize();
  new ResizeObserver(resize).observe($('milkdrop').parentElement);
  frame=requestAnimationFrame(render);
} catch (error) { $('audio-status').textContent = 'Visualizer could not start: ' + error.message; }
$('preset').onchange = () => { index=names.indexOf($('preset').value); loadPreset(); };
$('previous').onclick=()=>loadPreset(-1); $('next').onclick=()=>loadPreset(1);
$('cycle').onclick=()=>{automatic=!automatic;lastChange=performance.now();$('cycle').textContent=automatic?'AUTO ●':'AUTO ○';$('cycle').setAttribute('aria-pressed',automatic);};
$('mode').onchange=()=>{$('milkdrop').hidden=$('mode').value!=='milkdrop';$('spectrum').hidden=$('mode').value!=='spectrum';resize();};
async function devices() {const selected=$('input').value; const inputs=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='audioinput');$('input').replaceChildren(new Option('Default microphone / audio input',''));inputs.forEach((d,i)=>$('input').add(new Option(d.label||`Audio input ${i+1}`,d.deviceId)));if(inputs.some(d=>d.deviceId===selected))$('input').value=selected;}
function stop() {captureGeneration++; active=false; if(source){visualizer?.disconnectAudio(source);source.disconnect();source=null;}stream?.getTracks().forEach(t=>t.stop());stream=null;$('listen').textContent='ENABLE AUDIO REACTIVITY';$('mode-badge').textContent='AMBIENT · NO AUDIO INPUT';$('audio-status').textContent='Audio input is off. MilkDrop continues in ambient mode.';}
async function getStream(deviceId) {
  const constraints = { audio: { ...(deviceId ? {deviceId:{exact:deviceId}} : {}), echoCancellation:false, noiseSuppression:false, autoGainControl:false }, video: false };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    // A saved device (Bluetooth headset, USB mic) can vanish between sessions — a hard
    // "exact" constraint on a device that's no longer there fails outright instead of
    // falling back, which read as "the button just doesn't work sometimes".
    if (deviceId && (error.name === 'OverconstrainedError' || error.name === 'NotFoundError')) {
      console.warn('Saved audio input unavailable, falling back to default device:', error);
      $('input').value = '';
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }, video: false });
    }
    throw error;
  }
}
async function start() {
  if (starting) return;
  starting = true;
  $('listen').disabled = true;
  stop();
  const generation = captureGeneration;
  try {
    if (!context || !visualizer) throw new Error('Visualizer is unavailable');
    await context.resume();
    const acquired = await getStream($('input').value);
    if (generation !== captureGeneration) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired;
    source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    visualizer.connectAudio(source);
    active = true;
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (generation === captureGeneration) stop(); });
    await devices().catch(() => {});
    if (generation !== captureGeneration) return;
    $('listen').textContent = 'STOP AUDIO INPUT';
    $('mode-badge').textContent = 'LIVE · AUDIO REACTIVE';
    $('audio-status').textContent = 'Listening to your audio input. Play music on Sonos to animate the visuals.';
  } catch (error) {
    if (generation !== captureGeneration) return;
    stop();
    $('audio-status').textContent = 'Audio input unavailable. Check your input and macOS microphone permission, then retry. (' + error.name + ')';
  } finally { starting = false; $('listen').disabled = false; }
}
$('listen').onclick=()=>active?stop():start();$('input').onchange=()=>{if(active)start();};
navigator.mediaDevices?.addEventListener('devicechange',()=>devices().catch(()=>{}));
window.addEventListener('beforeunload',()=>{cancelAnimationFrame(frame);stop();context?.close();});
bounds();
