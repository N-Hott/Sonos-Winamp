const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function renderer(file) {
  const elements = new Map(), listeners = {}, classes = new Set();
  const element = id => {
    if (!elements.has(id)) elements.set(id,{id,value:'',textContent:'',width:300,height:150,hidden:false,options:[],parentElement:{getBoundingClientRect:()=>({width:640,height:160})},getBoundingClientRect:()=>({width:640,height:160}),setAttribute(){},add(o){this.options.push(o)},replaceChildren(){},click(){this.onclick?.()}});
    return elements.get(id);
  };
  let deliver, stopped=0, closed=0, connections=0;
  const acquired={getTracks:()=>[{stop:()=>stopped++}],getAudioTracks:()=>[{addEventListener(){}}]};
  const context={console,performance:{now:()=>1},setTimeout,clearTimeout,Option:function(label,value){this.value=value},ResizeObserver:class{observe(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){},visualizerUtils:{resizeVisualizer(){}},AudioContext:class{resume(){return Promise.resolve()}close(){closed++}createAnalyser(){return {}}createMediaStreamSource(){return {connect(){},disconnect(){}}}},navigator:{mediaDevices:{getUserMedia:()=>new Promise(resolve=>deliver=resolve),enumerateDevices:async()=>[],addEventListener(){}}},document:{getElementById:element,addEventListener(){},body:{classList:{contains:n=>classes.has(n),remove:n=>classes.delete(n),toggle(n){if(classes.has(n)){classes.delete(n);return false}classes.add(n);return true}}}}};
  context.window={addEventListener:(event,fn)=>listeners[event]=fn,butterchurn:{createVisualizer:()=>({loadPreset(){},render(){},setRendererSize(){},connectAudio(){connections++},disconnectAudio(){}})},butterchurnPresets:{getPresets:()=>({'test preset':{}})}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {context,element,listeners,resolve:()=>deliver(acquired),counts:()=>({stopped,closed,connections})};
}
for (const [name,file,start,hide] of [['main','ui/app.js','start()',r=>r.element('visual-toggle').click()],['mini','ui/mini.js','startMic()',r=>{r.element('vis-toggle').click();r.element('vis-toggle').click();}]]) {
  test(`${name}: hiding while microphone permission is pending releases late-arriving audio`, async()=>{
    const r=renderer(file);const pending=vm.runInContext(start,r.context);await new Promise(setImmediate);hide(r);r.resolve();await pending;
    assert.equal(r.counts().stopped,1);assert.equal(r.counts().connections,0);
  });
  test(`${name}: closing stops an active input and releases the audio context`,async()=>{
    const r=renderer(file);const pending=vm.runInContext(start,r.context);await new Promise(setImmediate);r.resolve();await pending;
    assert.equal(r.counts().connections,1);r.listeners.beforeunload();assert.equal(r.counts().stopped,1);assert.equal(r.counts().closed,1);
  });
}
