const {_electron:electron}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function run(){
  const profile=fs.mkdtempSync(path.join(root,'verification/drag-profile-'));
  const app=await electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,'--user-data-dir='+profile]});
  try{
    let pet;for(let i=0;i<100;i++){pet=app.windows().find(w=>w.url().includes('pet.html'));if(pet)break;await new Promise(r=>setTimeout(r,100));}
    if(!pet)throw Error('Pet not found');
    await pet.waitForFunction(()=>document.querySelector('#scene').naturalWidth===640);
    const results=[];
    for(const scale of [1,0.8,1.3]){
      await pet.evaluate(scale=>window.icey.saveSettings({scale}),scale);
      await app.evaluate(({screen})=>{globalThis.testCursor={x:400,y:400};screen.getCursorScreenPoint=()=>globalThis.testCursor;});
      const before=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html'));return {bounds:w.getBounds(),content:w.getContentSize()};});
      await pet.evaluate(()=>window.icey.drag('start'));
      for(let i=1;i<=40;i++){
        await app.evaluate((_,i)=>{globalThis.testCursor={x:400-i*3,y:400-i};},i);
        await pet.evaluate(()=>window.icey.drag('move'));
      }
      await pet.evaluate(()=>window.icey.drag('end'));
      const after=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html'));return {bounds:w.getBounds(),content:w.getContentSize()};});
      results.push({scale,before,after});
    }
    console.log(JSON.stringify(results,null,2));
    fs.writeFileSync(path.join(root,'verification/drag-results.json'),JSON.stringify(results,null,2));
    for(const {before,after}of results){assert.deepEqual(after.content,before.content,'drag must preserve content size');assert.equal(after.bounds.width,before.bounds.width);assert.equal(after.bounds.height,before.bounds.height);assert.equal(after.bounds.x,before.bounds.x-120);assert.equal(after.bounds.y,before.bounds.y-40);}
    console.log('PASS: drag retains size at all three scales');
  }finally{await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
