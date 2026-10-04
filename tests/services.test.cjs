const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Store,sanitizeSettings}=require('../src/services/store.cjs');
const {validateEndpoint,chat}=require('../src/services/chat.cjs');
const {inspectFile,trashSelected}=require('../src/services/files.cjs');
test('files changed after selection are rejected without calling trash',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'icey-file-test-'));
  try{const file=path.join(directory,'target.txt');await fs.writeFile(file,'before');const selected={id:'1',...await inspectFile(file)};await fs.writeFile(file,'different content');let calls=0;const results=await trashSelected([selected],async()=>{calls++;});assert.equal(calls,0);assert.equal(results[0].ok,false);assert.match(results[0].error,/变化/);assert.equal(await fs.readFile(file,'utf8'),'different content');}
  finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('trash success and failures are returned independently',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'icey-file-test-'));
  try{const files=await Promise.all(['one.txt','two.txt'].map(async(name,index)=>{const file=path.join(directory,name);await fs.writeFile(file,name);return {id:String(index),...await inspectFile(file)};}));const calls=[];const results=await trashSelected(files,async file=>{calls.push(file);if(file.endsWith('two.txt'))throw Error('access denied');});assert.equal(calls.length,2);assert.equal(results[0].ok,true);assert.equal(results[1].ok,false);}
  finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('directory selection is rejected',async()=>{await assert.rejects(inspectFile(os.tmpdir()),/普通文件/);});
test('credentials and insecure remote endpoints are rejected',()=>{
  assert.equal(validateEndpoint('http://127.0.0.1:11434/v1/'),'http://127.0.0.1:11434/v1');
  assert.equal(validateEndpoint('https://example.com/v1'),'https://example.com/v1');
  assert.throws(()=>validateEndpoint('http://example.com/v1'),/HTTPS/);
  assert.throws(()=>validateEndpoint('https://user:secret@example.com'),/密码/);
});
test('settings and tasks survive restart; scale is bounded',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'icey-store-test-'));
  try{const store=new Store(directory);store.setSettings({scale:4,voiceEnabled:true});store.setTasks([{id:'a',text:'test',done:false}]);store.appendHistory([{role:'assistant',content:'ready'}]);const restored=new Store(directory);assert.equal(restored.state.settings.scale,1.3);assert.equal(restored.state.tasks[0].text,'test');assert.equal(restored.state.history[0].content,'ready');assert.equal(sanitizeSettings({scale:-1}).scale,.7);}
  finally{await fs.rm(directory,{recursive:true,force:true});}
});
test('local chat does not claim that files were deleted',async()=>{
  const result=await chat({message:'帮我删除文件',history:[],settings:{},apiKey:''});assert.equal(result.mode,'local');assert.match(result.text,/选择文件/);assert.doesNotMatch(result.text,/已删除|已移入/);
});
test('configured chat service receives bounded history and returns reply',async()=>{
  const http=require('node:http');let request;
  const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>{body+=chunk;});req.on('end',()=>{request={path:req.url,auth:req.headers.authorization,body:JSON.parse(body)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'收到，操作者。'}}]}));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const history=Array.from({length:30},(_,i)=>({role:'user',content:String(i)}));const result=await chat({message:'你好',history,settings:{aiEndpoint:`http://127.0.0.1:${server.address().port}/v1`,aiModel:'test-model'},apiKey:'test-only',signal:AbortSignal.timeout(3000)});assert.equal(result.text,'收到，操作者。');assert.equal(result.mode,'remote');assert.equal(request.path,'/v1/chat/completions');assert.equal(request.body.messages.length,22);assert.equal(request.auth,'Bearer test-only');assert.equal(request.body.model,'test-model');}
  finally{await new Promise(resolve=>server.close(resolve));}
});
