const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const root=path.resolve(__dirname,'..'),packaged=process.argv.includes('--packaged');
const exe=packaged?path.join(root,`dist/ICEY-Desktop-${require('../package.json').version}/runtime/ICEY.exe`):path.join(root,'node_modules/electron/dist/electron.exe');
const profile=fs.mkdtempSync(path.join(root,'verification/screen-probe-profile-'));
async function main(){
  let app,receivedImage=false;
  const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    try{const message=JSON.parse(body).messages.at(-1);receivedImage=message.content?.[1]?.image_url?.url?.startsWith('data:image/jpeg;base64,')===true;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'本机截图验证完成。'}}]}));}
    catch{res.statusCode=400;res.end();}
  });});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    app=await electron.launch({executablePath:exe,args:[...(packaged?[]:[root]),'--user-data-dir='+profile],timeout:90000});
    let panel;for(let i=0;i<100;i++){panel=app.windows().find(w=>w.url().includes('panel.html'));if(panel)break;await new Promise(r=>setTimeout(r,100));}assert.ok(panel,'settings window did not open');
    await panel.waitForFunction(()=>document.querySelector('#ai-provider').options.length>=8);
    await panel.locator('[data-tab="settings"]').click();
    const detected=await panel.evaluate(async()=>{
      const screens=await window.icey.listScreens();
      const preview=await window.icey.previewScreen('');
      return {screens,preview:{isJpeg:preview.dataUrl.startsWith('data:image/jpeg;base64,'),bytes:preview.dataUrl.length,size:preview.size}};
    });
    assert.ok(detected.screens.length>0,'no physical screens detected');
    assert.ok(detected.screens.some(s=>s.name.startsWith('主屏幕')),'primary display is not identified');
    assert.ok(detected.preview.isJpeg&&detected.preview.bytes>1000,'preview returned no image');
    await panel.locator('#preview-screen').click();
    await panel.waitForFunction(()=>{const image=document.querySelector('#preview-image');return !document.querySelector('#screen-preview').hidden&&image.complete&&image.naturalWidth>0;});
    const rendered=await panel.locator('#preview-image').evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight}));
    assert.deepEqual(rendered,detected.preview.size);
    await panel.locator('#close-preview').click();
    assert.equal(await panel.locator('#preview-image').getAttribute('src'),null);
    await panel.evaluate(endpoint=>window.icey.saveSettings({aiEnabled:true,aiProvider:'custom',aiEndpoint:endpoint,aiModel:'local-test',modelVision:true,visionEnabled:true,visionScreen:'',proactiveEnabled:false,memoryEnabled:false}),`http://127.0.0.1:${server.address().port}/v1`);
    const reply=await panel.evaluate(()=>window.icey.chat('看看桌面',{withScreen:true}));
    assert.equal(reply.text,'本机截图验证完成。');
    assert.equal(receivedImage,true,'the real screenshot did not reach the local test model');
    const state=await panel.evaluate(()=>window.icey.getState());assert.ok(state.runtime.lastCaptureAt>0);
    console.log(JSON.stringify({pass:true,packaged,screens:detected.screens,preview:{size:detected.preview.size,rendered,bytes:detected.preview.bytes,localOnly:true,cleared:true},capture:{reachedLocalTestModel:true,lastCaptureRecorded:true}},null,2));
  }finally{
    if(app)await app.close();
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
    const base=path.resolve(root,'verification')+path.sep;
    if(!path.resolve(profile).startsWith(base))throw Error('Unsafe profile path');
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
