const {test}=require('node:test'),assert=require('node:assert/strict');
const {blankGrowth,applyLearning,localLearning,memoryContext}=require('../src/services/memory.cjs');
const {Vision}=require('../src/services/vision.cjs');
const {buildMessages}=require('../src/services/chat.cjs');
const {canSpeak,inQuietHours}=require('../src/services/proactive.cjs');
const {synthesize}=require('../src/services/tts.cjs');
test('memory requires verbatim user evidence; secrets and hallucinated evidence are rejected',()=>{
  const g=applyLearning(blankGrowth(),{memories:[{text:'用户喜欢画画',evidence:'我喜欢画画'},{text:'用户住在上海',evidence:'我住在上海'},{text:'密码是123456',evidence:'我喜欢画画'}],traits:[{trait:'warmth',delta:100,evidence:'我喜欢画画'},{trait:'warmth',delta:100,evidence:'我喜欢画画'},{trait:'humor',delta:2,evidence:'不存在'}]},'我喜欢画画');
  assert.equal(g.memories.length,1);assert.equal(g.traits.warmth,37);assert.equal(g.traits.humor,25);assert.equal(g.turns,1);
});
test('explicit preferences grow slowly, boundaries are retrievable, reset erases growth',()=>{
  let g=blankGrowth();for(let i=0;i<100;i++)g=applyLearning(g,localLearning('我喜欢画画，说话简洁一点'),'我喜欢画画，说话简洁一点');
  assert.equal(g.memories.length,1);assert.equal(g.traits.conciseness,90);assert.equal(g.journal.length,40);assert.match(memoryContext(g,'画画'),/画画/);assert.equal(blankGrowth().memories.length,0);
});
test('screen selection, preview and capture use the chosen physical display',async()=>{
  let calls=0;const displays=[{id:1,internal:true,size:{width:1920,height:1080}},{id:2,internal:false,size:{width:2560,height:1440}}];
  const screen={getPrimaryDisplay:()=>displays[0],getAllDisplays:()=>displays};
  const thumbnail=id=>({isEmpty:()=>false,toJPEG:()=>Buffer.from('synthetic image '+id),getSize:()=>({width:800,height:450})});
  const vision=new Vision({getSources:async()=>{calls++;return [{display_id:'2',thumbnail:thumbnail(2)},{display_id:'1',thumbnail:thumbnail(1)}];}},screen);
  assert.deepEqual(vision.displays(),[{id:'1',name:'主屏幕 · 内置 · 1920×1080'},{id:'2',name:'屏幕 2 · 外接 · 2560×1440'}]);
  await assert.rejects(vision.capture({aiEnabled:true,modelVision:true,visionEnabled:false}),/未授权/);assert.equal(calls,0);
  await assert.rejects(vision.capture({aiEnabled:true,modelVision:true,visionEnabled:true,visionScreen:'missing'}),/断开/);assert.equal(calls,0);
  assert.deepEqual(await vision.preview('2'),{dataUrl:'data:image/jpeg;base64,'+Buffer.from('synthetic image 2').toString('base64'),size:{width:800,height:450}});
  assert.equal(await vision.capture({aiEnabled:true,modelVision:true,visionEnabled:true}), 'data:image/jpeg;base64,'+Buffer.from('synthetic image 1').toString('base64'));assert.equal(calls,2);
  const ambiguous=new Vision({getSources:async()=>[{thumbnail:thumbnail(1)},{thumbnail:thumbnail(2)}]},screen);
  await assert.rejects(ambiguous.preview('2'),/没有获得所选屏幕/);
});
test('image is sent only on current message and never inside persona or history; disabled memory is excluded',()=>{
  const screenshot='data:image/jpeg;base64,TESTONLY';const g=blankGrowth();g.memories.push({text:'PRIVATE_MEMORY',id:'1'});
  const messages=buildMessages({message:'看看桌面',history:[{role:'user',content:'之前',screenshot}],settings:{memoryEnabled:false},growth:g,screenshot});
  assert.equal(messages[1].screenshot,undefined);assert.equal(messages[2].content[1].image_url.url,screenshot);assert.doesNotMatch(messages[0].content,/TESTONLY|PRIVATE_MEMORY/);assert.match(messages[0].content,/不可信数据/);
});
test('proactive respects quiet hours, activity, rate, hidden windows and locked session',()=>{
  assert.equal(inQuietHours(0,23,8),true);assert.equal(inQuietHours(8,23,8),false);assert.equal(inQuietHours(12,0,0),false);
  const now=new Date(2026,9,2,12).getTime();const input={settings:{aiEnabled:true,aiEndpoint:'https://example.com',aiModel:'test',proactiveEnabled:true,proactiveMinutes:10,quietStart:23,quietEnd:8},now,lastActivity:now-120000,lastAttempt:now-700000,locked:false,busy:false,idleSeconds:0,visible:true};
  assert.equal(canSpeak(input),true);for(const patch of[{locked:true},{busy:true},{visible:false},{idleSeconds:300},{lastActivity:now},{lastAttempt:now}])assert.equal(canSpeak({...input,...patch}),false);
});
test('TTS uses api_v2 contract and validates WAV, without a real voice or external service',async()=>{
  const http=require('node:http');let payload;let bad=false;
  const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{payload=JSON.parse(body);res.setHeader('Content-Type',bad?'application/json':'audio/wav');res.end(bad?'{}':Buffer.from('RIFF0000WAVEfmt test'));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const options={text:'我是艾希',settings:{voiceEnabled:true,voiceProvider:'gptsovits',ttsEndpoint:`http://127.0.0.1:${server.address().port}`,ttsReference:'fixture.wav',ttsPrompt:'参考文本',voiceRate:1},signal:AbortSignal.timeout(3000)};const result=await synthesize(options);assert.equal(result.mime,'audio/wav');assert.equal(payload.ref_audio_path,'fixture.wav');assert.equal(payload.streaming_mode,false);bad=true;await assert.rejects(synthesize(options),/没有返回音频/);}finally{await new Promise(r=>server.close(r));}
});
