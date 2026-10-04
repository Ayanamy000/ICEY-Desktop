const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
async function run(){
  const profile=fs.mkdtempSync(path.join(root,'verification/layout-profile-'));
  const app=await electron.launch({executablePath:path.join(root,'node_modules/electron/dist/electron.exe'),args:[root,'--user-data-dir='+profile]});
  try{
    let panel;for(let i=0;i<100;i++){panel=app.windows().find(w=>w.url().includes('panel.html'));if(panel)break;await new Promise(r=>setTimeout(r,100));}assert.ok(panel);
    const errors=[];panel.on('pageerror',error=>errors.push(error.message));
    await panel.waitForFunction(()=>document.querySelector('#ai-provider').options.length>=8);
    for(const [width,height] of [[920,670],[780,560]]){
      await app.evaluate(({BrowserWindow},size)=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('panel.html'));win.setSize(size[0],size[1]);},[width,height]);
      for(const name of['status','chat','tasks','files','settings','extensions']){
        await panel.locator(`[data-tab="${name}"]`).click();
        await panel.locator('#'+name).evaluate(element=>{element.scrollTop=0;});
        await panel.mouse.move(10,10);
        const measure=await panel.evaluate(()=>{const module=document.querySelector('.module:not([hidden])');const nav=document.querySelector('nav');const aside=document.querySelector('aside').getBoundingClientRect(),petButton=document.querySelector('#show-pet').getBoundingClientRect();const clipped=[...document.querySelectorAll('.system-line span,.module-title h1,nav button span')].filter(e=>e.getClientRects().length&&e.scrollWidth>e.clientWidth+2).map(e=>e.textContent.trim());return {body:document.body.scrollWidth,viewport:innerWidth,module:module.scrollWidth,moduleWidth:module.clientWidth,nav:nav.scrollWidth,navWidth:nav.clientWidth,petButtonVisible:petButton.bottom<=aside.bottom+1,clipped};});
        assert.ok(measure.body<=measure.viewport+2,`${name} body overflow at ${width}: ${JSON.stringify(measure)}`);
        assert.ok(measure.module<=measure.moduleWidth+2,`${name} module overflow at ${width}: ${JSON.stringify(measure)}`);
        assert.ok(measure.nav<=measure.navWidth+2,`${name} nav overflow at ${width}: ${JSON.stringify(measure)}`);
        assert.ok(measure.petButtonVisible,`${name} pet button below panel at ${width}`);
        assert.deepEqual(measure.clipped,[],`${name} clipped text at ${width}`);
        if(name==='chat')assert.ok(await panel.locator('#messages').evaluate(element=>element.scrollHeight<=element.clientHeight+2),'Empty greeting must fit without scrolling');
        await panel.screenshot({path:path.join(root,`verification/layout-${name}-${width}.png`)});
      }
      await panel.locator('[data-tab="chat"]').click();await panel.locator('#manage-memory').click();assert.equal(await panel.getByRole('heading',{name:'共同记忆'}).isVisible(),true);await panel.screenshot({path:path.join(root,`verification/layout-memory-${width}.png`)});await panel.locator('#back-chat').click();assert.equal(await panel.getByRole('heading',{name:'与艾希对话'}).isVisible(),true);
      await panel.locator('[data-prompt]').first().click();assert.equal(await panel.locator('#chat-input').inputValue(),'帮我理清今天的安排。');await panel.locator('#chat-input').fill('');
      await panel.locator('[data-open="settings"]').click();await panel.locator('[data-setting-link="company-settings"]').click();assert.ok(await panel.locator('#company-settings').isVisible());
      const text=await panel.locator('body').innerText();assert.doesNotMatch(text,/模型权重|洛天依|初始人格提示词|image_url|同人延伸/);
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(root,'verification/layout-results.json'),JSON.stringify({pass:true,sizes:['920x670','780x560'],sections:['status','chat','tasks','files','settings','extensions','memory management']},null,2));console.log('Layout passed at default and minimum window sizes.');
  }finally{await app.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
