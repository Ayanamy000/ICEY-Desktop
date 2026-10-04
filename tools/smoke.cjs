const {_electron:electron}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
  const profile=fs.mkdtempSync(path.join(root,'verification/smoke-profile-'));
  const app=await electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,'--user-data-dir='+profile]});
  const appProcess=app.process();
  const errors=[];
  try{
    async function windowFor(name){for(let i=0;i<150;i++){const page=app.windows().find(page=>page.url().includes(name));if(page)return page;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('Window not found: '+name);}
    const panel=await windowFor('panel.html'),pet=await windowFor('pet.html');
    for(const page of[panel,pet])page.on('pageerror',error=>errors.push(error.message));
    await pet.waitForFunction(()=>document.querySelector('#loading').hidden,{timeout:30000});
    await pet.waitForFunction(()=>document.querySelector('#scene').tagName==='IMG'&&document.querySelector('#scene').naturalWidth===640);
    await app.evaluate(({BrowserWindow})=>{const panel=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('panel.html'));panel.show();panel.focus();});
    const firstFrame=await pet.locator('#scene').getAttribute('src');
    await pet.waitForFunction(first=>document.querySelector('#scene').getAttribute('src')!==first,firstFrame);
    await app.evaluate(({BrowserWindow})=>{const pet=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html'));pet.hide();pet.showInactive();});
    await pet.waitForFunction(()=>document.querySelector('#scene').complete&&document.querySelector('#scene').naturalWidth===640);
    await pet.screenshot({path:path.join(root,'verification/app-pet-fixed.png'),omitBackground:true});
    await panel.getByRole('heading',{name:'与艾希对话'}).waitFor();
    const state=await panel.evaluate(()=>window.icey.getState());
    if(!state.settings)throw Error('Preload bridge failed');
    await panel.locator('[data-tab="tasks"]').click();
    await panel.locator('#task-input').fill('验证任务');await panel.locator('#task-form').evaluate(form=>form.requestSubmit());
    await panel.locator('.task span').filter({hasText:'验证任务'}).waitFor();
    await panel.locator('[data-tab="chat"]').click();await panel.locator('#chat-input').fill('现在几点');await panel.locator('#chat-form').evaluate(form=>form.requestSubmit());
    await panel.waitForFunction(()=>document.querySelector('#messages').textContent.includes('现在是'));
    await panel.locator('[data-tab="settings"]').click();await panel.locator('#scale').fill('0.9');await panel.locator('#settings-form').evaluate(form=>form.requestSubmit());await panel.waitForFunction(()=>document.querySelector('#settings-result').textContent.includes('设置已保存'));
    await panel.locator('[data-tab="status"]').click();
    const statusText=await panel.locator('#status').innerText();
    if(!/角色资源\s*载入完成/.test(statusText)||!/运动模块\s*就绪/.test(statusText))throw Error('Status copy is stale');
    if(await panel.locator('nav [data-tab]').count()!==5)throw Error('The sixth module is still in primary navigation');
    await panel.screenshot({path:path.join(root,'verification/app-terminal.png')});
    await panel.locator('#status-demo').click();
    await pet.waitForFunction(()=>!document.querySelector('#target').hidden);
    const targetBounds=await pet.locator('#target').boundingBox();
    const petViewport=await pet.evaluate(()=>({width:innerWidth,height:innerHeight}));if(targetBounds.x+targetBounds.width>petViewport.width*.42)throw Error('File target is not in front of ICEY on the left');
    await pet.screenshot({path:path.join(root,'verification/app-shred-left-target.png'),omitBackground:true});
    await pet.waitForFunction(()=>document.querySelector('#target').classList.contains('shattered'));
    await pet.screenshot({path:path.join(root,'verification/app-shred.png'),omitBackground:true});
    await pet.waitForFunction(()=>document.querySelector('#target').hidden,{timeout:5000});
    // Only this self-created test file is passed to the real Windows recycle-bin API.
    const testFile=path.join(root,'verification','disposable-shred-test.txt');fs.writeFileSync(testFile,'ICEY integration test fixture');
    await app.evaluate(({dialog},testFile)=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[testFile]});
      dialog.showMessageBox=async()=>({response:0});
    },testFile);
    await panel.locator('[data-tab="files"]').click();await panel.locator('#select-files').click();await panel.locator('.file-entry').waitFor();
    await panel.locator('#trash-files').click();await panel.waitForFunction(()=>document.querySelector('#system-message').textContent.includes('已取消'));
    if(!fs.existsSync(testFile))throw Error('Cancel deleted test file');
    await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
    await panel.locator('#trash-files').click();await panel.waitForFunction(()=>document.querySelector('#file-result').textContent.includes('[ 完成 ]'));
    if(fs.existsSync(testFile))throw Error('Recycle operation did not move test file');
    await panel.screenshot({path:path.join(root,'verification/app-files.png')});
    await pet.waitForFunction(()=>document.querySelector('#target').hidden,{timeout:5000});
    const config=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({transparent:w.isVisible(),bounds:w.getBounds(),alwaysOnTop:w.isAlwaysOnTop(),preferences:w.webContents.getLastWebPreferences()})));
    if(config.some(w=>w.preferences.nodeIntegration||!w.preferences.contextIsolation||!w.preferences.sandbox))throw Error('Window isolation failed');
    const throttling=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html')).webContents.getBackgroundThrottling());
    if(throttling!==false)throw Error('Pet background frames may be throttled');
    // Exercise the exact native destruction path behind the reported exception.
    await app.evaluate(({BrowserWindow})=>{const terminal=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('panel.html'));terminal.destroy();});
    await pet.evaluate(()=>window.icey.openPanel('status'));
    const reopened=await windowFor('panel.html');
    await reopened.getByRole('heading',{name:'系统状态'}).waitFor();
    if(errors.length)throw Error(errors.join('\n'));
    fs.writeFileSync(path.join(root,'verification/smoke-results.json'),JSON.stringify({pass:true,checks:['pet assets loaded','DOM character first frame','animation updates with terminal focused','hide and show restores character','background throttling disabled','preload bridge','task persistence','local chat','settings scale','shred demonstration','cancel retains file','self-created file recycled through shell.trashItem','isolated windows'],errors},null,2));
    console.log('Smoke passed: assets, tasks, chat, settings, shred animation, sandbox');
  }finally{await app.close();if(appProcess.exitCode===null)await new Promise(resolve=>appProcess.once('exit',resolve));if(appProcess.exitCode!==0)throw Error('Electron did not exit cleanly: '+appProcess.exitCode);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
