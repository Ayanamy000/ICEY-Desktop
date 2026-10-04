const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const exe=packaged?path.join(root,`dist/ICEY-Desktop-${require('../package.json').version}/runtime/ICEY.exe`):path.join(root,'node_modules/electron/dist/electron.exe');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const requests=[],errors=[];let learningDelay=0;
  const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    const data=JSON.parse(body);requests.push(data);const system=data.messages[0].content,isLearning=system.startsWith('从用户本轮原话'),image=Array.isArray(data.messages.at(-1).content),proactive=system.includes('这是一次主动交流机会');
    const text=isLearning?JSON.stringify({memories:[{text:'用户希望被称作小林',kind:'preference',evidence:'请叫我小林'}],traits:[{trait:'warmth',delta:2,evidence:'温柔一点'}]}):image?'测试画面里有一个图标。':proactive?'要一起看看尚未完成的画画任务吗？':'小林，我记住这个称呼了。';
    setTimeout(()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:text}}]}));},isLearning?learningDelay:0);
  });});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(root,'verification/companion-profile-'));
  let app;
  try{
    const args=[...(packaged?[]:[root]),'--user-data-dir='+profile];app=await electron.launch({executablePath:exe,args,timeout:90000});
    let panel,pet;for(let i=0;i<300;i++){panel=app.windows().find(w=>w.url().includes('panel.html'));pet=app.windows().find(w=>w.url().includes('pet.html'));if(panel&&pet)break;await delay(100);}assert.ok(panel&&pet);
    for(const p of[panel,pet])p.on('pageerror',e=>errors.push(e.message));await panel.waitForFunction(()=>document.querySelector('#ai-provider').options.length>=8);await pet.waitForFunction(()=>document.querySelector('#loading').hidden&&document.querySelector('#scene').naturalWidth===640);
    const initial=await panel.evaluate(()=>window.icey.getState());assert.equal(initial.settings.aiProvider,'qwen');assert.equal(initial.settings.visionEnabled,false);
    await panel.locator('[data-tab="settings"]').click();await panel.locator('#ai-provider').selectOption('deepseek');assert.equal(await panel.locator('#ai-endpoint').inputValue(),'https://api.deepseek.com');
    await panel.locator('#ai-provider').selectOption('qwen');await panel.locator('#vision-model').click();assert.equal(await panel.locator('#ai-model').inputValue(),'qwen3-vl-plus');assert.equal(await panel.locator('#vision-enabled').isChecked(),false);
    await panel.screenshot({path:path.join(root,'verification/companion-settings.png')});
    await panel.evaluate(endpoint=>window.icey.saveSettings({aiEnabled:true,aiProvider:'custom',aiEndpoint:endpoint,aiModel:'mock-model',proactiveEnabled:false,apiKey:'mock-key',clearApiKey:false,modelVision:true,visionEnabled:false}),`http://127.0.0.1:${server.address().port}/v1`);
    // Replace capture with a bundled icon: this test never captures the user's desktop.
    await app.evaluate(({desktopCapturer,screen,nativeImage},root)=>{globalThis.captureCalls=0;globalThis.captureDelay=0;desktopCapturer.getSources=async()=>{globalThis.captureCalls++;await new Promise(r=>setTimeout(r,globalThis.captureDelay));return [{display_id:String(screen.getPrimaryDisplay().id),thumbnail:nativeImage.createFromPath(root+'/src/assets/tray.png')}];};},root);
    const denied=await panel.evaluate(()=>window.icey.chat('测试读取',{withScreen:true}).then(()=>false,e=>e.message));assert.match(denied,/桌面感知/);assert.equal(await app.evaluate(()=>globalThis.captureCalls),0);
    await panel.evaluate(()=>window.icey.chat('请叫我小林，说话温柔一点'));await panel.waitForFunction(async()=>{const s=await window.icey.getState();return s.growth.memories.length===1;});
    let state=await panel.evaluate(()=>window.icey.getState());assert.equal(state.growth.traits.warmth,37);assert.equal(state.hasApiKey,true);assert.equal(JSON.stringify(state).includes('mock-key'),false);
    await panel.locator('[data-tab="chat"]').click();await panel.locator('#manage-memory').click();await panel.screenshot({path:path.join(root,'verification/companion-memory.png')});
    await panel.locator('.memory-entry textarea').fill('用户希望被称作小雨');await panel.getByRole('button',{name:'保存修正',exact:true}).click();state=await panel.evaluate(()=>window.icey.getState());assert.equal(state.growth.memories[0].text,'用户希望被称作小雨');
    const turns=state.growth.turns;await panel.evaluate(()=>window.icey.saveSettings({visionEnabled:true}));const count=requests.length;await panel.evaluate(()=>window.icey.chat('看看桌面',{withScreen:true}));assert.equal(requests.length,count+1);assert.ok(Array.isArray(requests.at(-1).messages.at(-1).content));state=await panel.evaluate(()=>window.icey.getState());assert.equal(state.growth.turns,turns);assert.equal(JSON.stringify(state).includes('data:image'),false);assert.ok(state.runtime.lastCapture);
    // Revoking permission while capture is pending must prevent transmission.
    await app.evaluate(()=>{globalThis.captureDelay=1200;});const beforeRevoke=requests.length;
    const pending=panel.evaluate(()=>window.icey.chat('取消中的截图',{withScreen:true}).then(()=>false,e=>e.message));await delay(200);await panel.evaluate(()=>window.icey.pauseAwareness());assert.match(await pending,/取消/);assert.equal(requests.length,beforeRevoke);await app.evaluate(()=>{globalThis.captureDelay=0;});
    // Pending extraction cannot resurrect a deleted memory.
    learningDelay=1000;await panel.evaluate(()=>window.icey.chat('请叫我小林，说话温柔一点'));await delay(100);await panel.evaluate(()=>window.icey.resetMemory());await delay(1100);state=await panel.evaluate(()=>window.icey.getState());assert.equal(state.growth.memories.length,0);assert.equal(state.growth.turns,0);learningDelay=0;
    // Actual scheduler tick with a synthetic clock and no desktop capture.
    await panel.evaluate(()=>window.icey.saveTasks([{id:'paint',text:'画画',done:false}]));await panel.evaluate(()=>window.icey.saveSettings({proactiveEnabled:true,proactiveMinutes:2,quietStart:0,quietEnd:0,visionEnabled:false}));
    await app.evaluate(({powerMonitor})=>{const realNow=Date.now;Date.now=()=>realNow()+700000;powerMonitor.getSystemIdleTime=()=>0;});
    await panel.waitForFunction(async()=>{const s=await window.icey.getState();return s.history.some(m=>m.proactive);},null,{timeout:40000});
    await panel.locator('[data-tab="chat"]').click();await panel.screenshot({path:path.join(root,'verification/companion-chat.png')});
    await panel.evaluate(()=>window.icey.pauseAwareness());const afterPause=requests.length;await delay(500);assert.equal(requests.length,afterPause);
    // A second launch of the exact same program/profile must exit, leaving two windows.
    const child=spawn(exe,args,{windowsHide:true,stdio:'ignore'});const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Duplicate instance did not exit')),60000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});child.once('error',e=>{clearTimeout(timer);reject(e);});});assert.equal(code,0);assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),2);
    const serialized=fs.readFileSync(path.join(profile,'state.json'),'utf8');assert.equal(serialized.includes('data:image'),false);assert.equal(serialized.includes('mock-key'),false);assert.deepEqual(errors,[]);
    const result={pass:true,packaged,requests:requests.length,checks:['preset UI','explicit screen permission','evidence-based growth','memory correction','synthetic vision payload','no screenshot persistence or learning','revocation cancels capture','reset cancels pending learning','scheduled proactive message','pause awareness','single instance retains two windows','encrypted key only','no renderer errors']};fs.writeFileSync(path.join(root,`verification/companion-${packaged?'packaged':'source'}-results.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
