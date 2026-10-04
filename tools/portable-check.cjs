const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,useCommand=process.argv.includes('--cmd'),exe=path.join(root,`dist/ICEY-Desktop-${version}/启动艾希.${useCommand?'cmd':'exe'}`),delay=ms=>new Promise(r=>setTimeout(r,ms));
const runtime=path.join(root,`dist/ICEY-Desktop-${version}/runtime/ICEY.exe`);
function start(args){return useCommand?spawn('cmd.exe',['/d','/c',exe,...args],{windowsHide:true,stdio:'pipe'}):spawn(exe,args,{windowsHide:true,stdio:'pipe'});}
function runtimeIds(){const result=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'tools/list-runtime-processes.ps1'),'-RuntimePath',runtime],{windowsHide:true,encoding:'utf8'}).trim();return result?JSON.parse(result):[];}
async function main(){
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const initialIds=new Set(runtimeIds());const profile=fs.mkdtempSync(path.join(root,'verification/portable-profile-')),args=['--user-data-dir='+profile,'--remote-debugging-port='+port];
  const launcher=start(args);let output='';launcher.stdout.on('data',c=>output+=c);launcher.stderr.on('data',c=>output+=c);let browser,panel;
  try{
    let cdpVersion;for(let i=0;i<120;i++){try{const res=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});cdpVersion=await res.json();break;}catch{}if(launcher.exitCode!==null&&launcher.exitCode!==0)throw Error('Launcher exited '+launcher.exitCode+' '+output);await delay(500);}assert.ok(cdpVersion,'Launcher did not start the external runtime');
    browser=await chromium.connectOverCDP(cdpVersion.webSocketDebuggerUrl);
    const firstIds=new Set(runtimeIds().filter(id=>!initialIds.has(id)));
    let pet;for(let i=0;i<100;i++){const pages=browser.contexts().flatMap(c=>c.pages());panel=pages.find(p=>p.url().endsWith('panel.html'));pet=pages.find(p=>p.url().endsWith('pet.html'));if(panel&&pet)break;await delay(100);}assert.ok(panel&&pet);
    await panel.getByRole('heading',{name:'与艾希对话'}).waitFor();
    await pet.waitForFunction(()=>document.querySelector('#loading').hidden&&document.querySelector('#scene').naturalWidth===640);await panel.waitForFunction(()=>document.querySelector('#ai-provider').options.length>=8);
    const state=await panel.evaluate(()=>window.icey.getState());assert.equal(state.settings.visionEnabled,false);assert.equal(state.settings.aiEnabled,false);assert.ok(state.persona.includes('屏幕外'));
    await panel.locator('[data-tab="chat"]').click();await panel.locator('#manage-memory').click();await panel.screenshot({path:path.join(root,'verification/portable-final.png')});
    const duplicate=start(['--user-data-dir='+profile]);const code=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Duplicate launcher did not exit')),60000);duplicate.once('exit',code=>{clearTimeout(timer);resolve(code);});duplicate.once('error',e=>{clearTimeout(timer);reject(e);});});assert.equal(code,0);
    await panel.waitForFunction(async()=>{const state=await window.icey.getState();return !!state.runtime.reopenedAt;},null,{timeout:15000});
    let settled=0;for(let i=0;i<30&&settled<2;i++){const transient=runtimeIds().filter(id=>!initialIds.has(id)&&!firstIds.has(id));settled=transient.length?0:settled+1;if(settled<2)await delay(200);}assert.equal(settled,2,'Duplicate runtime did not finish exiting');
    assert.equal(browser.contexts().flatMap(c=>c.pages()).length,2);
    const quitResult=await panel.evaluate(()=>window.icey.windowAction('quit').then(()=> 'acknowledged',error=>'IPC error: '+error.message)).catch(error=>'Page closed: '+error.message);
    if(!['acknowledged'].includes(quitResult)&&!quitResult.startsWith('Page closed:'))throw Error(quitResult);
    for(let i=0;i<30&&runtimeIds().some(id=>!initialIds.has(id));i++)await delay(300);
    assert.deepEqual(runtimeIds().filter(id=>!initialIds.has(id)),[],'Runtime continued after Quit');
    assert.equal(launcher.exitCode,0);
    const result={pass:true,entry:useCommand?'cmd':'exe',checks:['launcher starts external runtime','character animates from external assets','CRT panel loads','persona and presets present','default screen permission off','second launcher exits without duplicate windows','clean quit']};fs.writeFileSync(path.join(root,`verification/launcher-${useCommand?'cmd':'exe'}-${version}-results.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
  }finally{if(panel&&!panel.isClosed())await panel.evaluate(()=>window.icey.windowAction('quit')).catch(()=>{});if(browser)await browser.close().catch(()=>{});for(const id of runtimeIds().filter(id=>!initialIds.has(id))){try{process.kill(id);}catch{}}}
}
main().catch(e=>{fs.writeFileSync(path.join(root,`verification/launcher-${useCommand?'cmd':'exe'}-${version}-results.json`),JSON.stringify({pass:false,entry:useCommand?'cmd':'exe',reason:e.message},null,2));console.error(e);process.exitCode=1;});
