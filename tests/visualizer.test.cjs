const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resizeVisualizer} = require('../ui/visualizer-utils.js');
test('resizes the output canvas along with MilkDrop, including mini and expanded sizes', () => {
  const canvas={width:300,height:150}; const calls=[];
  const visualizer={setRendererSize:(w,h)=>calls.push([w,h])};
  for(const [width,height] of [[340,220],[640,160],[1050,580],[340,220]]) {
    assert.equal(resizeVisualizer(canvas,{getBoundingClientRect:()=>({width,height})},visualizer),true);
    assert.deepEqual([canvas.width,canvas.height],[width,height]);
  }
  assert.equal(calls.length,4);
});
test('hidden views preserve their last drawable size and unchanged views avoid reallocating textures',()=>{
  const canvas={width:640,height:160};
  const visualizer={setRendererSize:()=>assert.fail('should not reallocate')};
  for(const [width,height] of [[0,0],[640,0],[640,160]]) assert.equal(resizeVisualizer(canvas,{getBoundingClientRect:()=>({width,height})},visualizer),false);
  assert.deepEqual(canvas,{width:640,height:160});
});
