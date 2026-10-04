const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const exe=packaged?path.join(root,`dist/ICEY-Desktop-${require('../package.json').version}/runtime/ICEY.exe`):path.join(root,'node_modules/electron/dist/electron.exe');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function launch(profile){
  const app=await electron.launch({executablePath:exe,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],timeout:90000});
  let panel,pet;for(let i=0;i<300;i++){panel=app.windows().find(w=>w.url().includes('panel.html'));pet=app.windows().find(w=>w.url().includes('pet.html'));if(panel&&pet)break;await delay(100);}
  assert.ok(panel&&pet,'Both windows must open');
  await panel.waitForFunction(()=>document.querySelector('#ai-provider').options.length>0);
  await pet.waitForFunction(()=>document.querySelector('#loading').hidden&&document.querySelector('#scene').naturalWidth===640);
  return {app,panel,pet};
}
async function direction(pet,destination){
  await pet.evaluate(direction=>{
    const scene=document.querySelector('#scene'),rect=scene.getBoundingClientRect();
    let point;for(let y=150;y<400&&!point;y+=5)for(let x=100;x<500;x+=5){if(ctx.getImageData(x-2,y-2,5,5).data.every((value,index)=>index%4!==3||value>100)){point={x,y};break;}}
    if(!point)throw Error('No visible character pixel');
    const clientX=rect.left+(facing==='right'?640-point.x:point.x)*rect.width/640,clientY=rect.top+point.y*rect.height/480;
    const start=200,finish=direction==='right'?240:160;
    for(const [name,screenX] of[['pointerdown',start],['pointermove',finish],['pointerup',finish]]){
      scene.dispatchEvent(new PointerEvent(name,{bubbles:true,pointerId:1,button:0,clientX,clientY,screenX,screenY:200}));
    }
  },destination);
  const result=await pet.evaluate(()=>({right:document.querySelector('#pet-root').classList.contains('face-right'),transform:getComputedStyle(document.querySelector('#scene')).transform,target:getComputedStyle(document.querySelector('#target')).left,targetRight:getComputedStyle(document.querySelector('#target')).right}));
  assert.equal(result.right,destination==='right');
  assert.equal(result.transform==='none',destination==='left');
  assert.equal(destination==='right'?result.target:result.targetRight,'auto');
  await pet.evaluate(()=>window.icey.demoShred());
  await pet.waitForFunction(()=>!document.querySelector('#target').hidden);
  const bounds=await pet.evaluate(()=>({root:document.querySelector('#pet-root').getBoundingClientRect().toJSON(),target:document.querySelector('#target').getBoundingClientRect().toJSON()}));
  assert.ok(destination==='right'?bounds.target.x>bounds.root.x+bounds.root.width/2:bounds.target.right<bounds.root.x+bounds.root.width/2);
  await pet.waitForFunction(()=>document.querySelector('#target').hidden&&!shredding,null,{timeout:8000});
}
async function main(){
  const requests=[];const server=http.createServer((req,res)=>{const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>{requests.push({authorization:req.headers.authorization,body:Buffer.concat(chunks).toString()});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'智能回复已连接。'}}]}));});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(root,'verification/key-direction-profile-'));
  let session;
  try{
    session=await launch(profile);const {panel,pet}=session;
    await panel.locator('[data-tab="settings"]').click();
    await panel.locator('#ai-provider').selectOption('custom');
    assert.equal(await panel.locator('#clear-key').isChecked(),false);
    await panel.locator('#ai-endpoint').fill(`http://127.0.0.1:${server.address().port}/v1`);
    await panel.locator('#ai-model').fill('test-model');
    await panel.locator('#api-key').fill('test-key-1');
    await panel.locator('#ai-enabled').check();
    await panel.locator('#memory-enabled').uncheck();
    await panel.locator('#settings-form button[type="submit"]').click();
    await panel.waitForFunction(()=>document.querySelector('#settings-result').textContent.includes('密钥已保存'));
    assert.equal((await panel.evaluate(()=>window.icey.getState())).hasApiKey,true);
    await panel.locator('#clear-key').check();
    await panel.locator('#api-key').fill('test-key-2');
    await panel.locator('#settings-form button[type="submit"]').click();
    await panel.waitForFunction(()=>document.querySelector('#settings-result').textContent.includes('密钥已保存'));
    await panel.evaluate(()=>window.icey.chat('测试智能对话'));
    assert.equal(requests.at(-1).authorization,'Bearer test-key-2');
    await direction(pet,'right');
    await direction(pet,'left');
    await session.app.close();session=null;
    const saved=fs.readFileSync(path.join(profile,'state.json'),'utf8');
    assert.equal(saved.includes('test-key-2'),false);
    session=await launch(profile);
    assert.equal((await session.panel.evaluate(()=>window.icey.getState())).hasApiKey,true);
    await session.panel.evaluate(()=>window.icey.chat('重启后再试'));
    assert.equal(requests.at(-1).authorization,'Bearer test-key-2');
    const result={pass:true,packaged,checks:['settings form saves encrypted key','new key overrides old clear flag','model request uses saved key','key survives restart','right run faces right','left run faces left','shred target stays in front']};
    fs.writeFileSync(path.join(root,`verification/key-direction-${packaged?'packaged':'source'}-results.json`),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{
    if(session)await session.app.close();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    const verification=path.resolve(root,'verification')+path.sep;
    if(!path.resolve(profile).startsWith(verification))throw Error('Unsafe test profile path');
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
