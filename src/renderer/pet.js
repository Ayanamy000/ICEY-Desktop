const scene=document.querySelector('#scene'),hitCanvas=document.createElement('canvas');
hitCanvas.width=640;hitCanvas.height=480;
const ctx=hitCanvas.getContext('2d',{willReadFrequently:true});
const effects=document.querySelector('#effects'),fx=effects.getContext('2d');
let animations={},current='Idle',started=performance.now(),oneShot=false,settings={},dragging=false,moved=false,pointerStart=null,lastPointerX=null,facing='left',shredding=false,queue=[],speechTimer;
function face(direction){if(direction===facing)return;facing=direction;document.querySelector('#pet-root').classList.toggle('face-right',facing==='right');}
const voice=window.iceyVoice;
function say(text){const speech=document.querySelector('#speech');speech.textContent=text.length>140?text.slice(0,137)+'…':text;speech.hidden=false;clearTimeout(speechTimer);speechTimer=setTimeout(()=>{speech.hidden=true;},6500);voice.speak(text,settings).catch(error=>{speech.textContent='声音输出未完成：'+error.message.replace(/^Error invoking remote method '[^']+': Error: /,'');speech.hidden=false;clearTimeout(speechTimer);speechTimer=setTimeout(()=>{speech.hidden=true;},10000);});}
function play(name,once=false){if(!animations[name])return;current=name;started=performance.now();oneShot=once;}
async function load(){
  const manifest=await(await fetch('../assets/animations/manifest.json')).json();
  async function loadAnimation(name){const info=manifest.animations[name];const images=await Promise.all(Array.from({length:info.count},async(_,i)=>{const img=new Image();img.src=`../assets/animations/${name}/${String(i).padStart(3,'0')}.png`;await img.decode();return img;}));animations[name]={...info,images};}
  await loadAnimation('Idle');
  // Paint synchronously before scheduling animation; the first visible character
  // must not depend on a focused window or on secondary animation downloads.
  document.querySelector('#loading').hidden=true;play('Idle');drawFrame(animations.Idle.images[0]);requestAnimationFrame(tick);
  for(const name of Object.keys(manifest.animations).filter(name=>name!=='Idle')){
    try{await loadAnimation(name);}catch(error){console.error(`Animation ${name} unavailable`,error);say('部分动作加载失败，待机仍然可用。');}
  }
}
let lastFrame=null;
function drawFrame(image){if(lastFrame===image)return;lastFrame=image;scene.src=image.src;ctx.clearRect(0,0,640,480);ctx.drawImage(image,0,0);}
function tick(time){const anim=animations[current];if(anim){let seconds=Math.max(0,(time-started)/1000);if(oneShot&&seconds>=anim.duration){play('Idle');seconds=0;}const active=animations[current];const index=Math.min(active.count-1,Math.floor((seconds%active.duration)/active.duration*active.count));drawFrame(active.images[index]);}requestAnimationFrame(tick);}
function interactive(event){if(shredding||dragging)return true;if(event.target.closest('#toolbar,#speech'))return true;const r=scene.getBoundingClientRect(),x=(event.clientX-r.left)*640/r.width,y=(event.clientY-r.top)*480/r.height;if(x<0||y<0||x>=640||y>=480)return false;return ctx.getImageData(Math.floor(facing==='right'?640-x:x),Math.floor(y),1,1).data[3]>25;}
let lastHover=null;
document.addEventListener('mousemove',event=>{const value=interactive(event);if(value!==lastHover){lastHover=value;window.icey.hover(value);}});
scene.addEventListener('pointerdown',event=>{if(event.button!==0||shredding||!interactive(event))return;pointerStart={x:event.screenX,y:event.screenY};lastPointerX=event.screenX;moved=false;dragging=true;scene.setPointerCapture(event.pointerId);window.icey.drag('start');});
scene.addEventListener('pointermove',event=>{if(!dragging)return;if(Math.abs(event.screenX-pointerStart.x)+Math.abs(event.screenY-pointerStart.y)>4){if(event.screenX!==lastPointerX)face(event.screenX>lastPointerX?'right':'left');lastPointerX=event.screenX;if(!moved)play('Run');moved=true;window.icey.drag('move');}});
function endDrag(){if(!dragging)return;dragging=false;window.icey.drag('end');play('Idle');if(!moved)say(['我在。想说些什么？','今天想从哪件事开始？','嗯，听见你了。'][Math.floor(Math.random()*3)]);}
scene.addEventListener('pointerup',endDrag);scene.addEventListener('pointercancel',endDrag);scene.addEventListener('lostpointercapture',endDrag);
scene.addEventListener('dblclick',()=>window.icey.openPanel('chat'));
document.addEventListener('contextmenu',event=>{event.preventDefault();window.icey.petMenu();});
document.querySelector('#terminal').onclick=()=>window.icey.openPanel('chat');document.querySelector('#menu').onclick=()=>window.icey.petMenu();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function shatter(){
  const particles=Array.from({length:32},(_,i)=>({x:55+(i%8)*10,y:220+Math.floor(i/8)*15,vx:-120-Math.random()*200,vy:-180+Math.random()*240,rotation:Math.random()*6,color:i%3?'#d5c9be':'#72f4fb'}));
  const start=performance.now();
  function animate(now){const t=(now-start)/1000;fx.clearRect(0,0,640,480);if(t>1.1)return;
    for(const p of particles){fx.save();fx.translate(p.x+p.vx*t,p.y+p.vy*t+180*t*t);fx.rotate(p.rotation+t*5);fx.globalAlpha=Math.max(0,1-t);fx.fillStyle=p.color;fx.fillRect(-4,-5,8,10);fx.restore();}
    if(t<.22){fx.save();fx.globalAlpha=1-t/.22;fx.strokeStyle='#a0fdff';fx.lineWidth=8;fx.shadowColor='#3cebf2';fx.shadowBlur=25;fx.beginPath();fx.moveTo(320,350);fx.lineTo(45,115);fx.stroke();fx.restore();}
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
async function processQueue(){
  if(shredding)return;shredding=true;window.icey.hover(true);
  while(queue.length){const job=queue.shift();const target=document.querySelector('#target');document.querySelector('#target-name').textContent=job.names.length===1?job.names[0]:`${job.names[0]} 等 ${job.names.length} 个文件`;target.classList.remove('shattered');target.hidden=false;say(job.demo?'只是练习。看好了。':'文件已经回收。最后这一下，交给我。');await delay(450);play('Atk1',true);await delay(180);target.classList.add('shattered');shatter();await delay(500);play('Atk2',true);await delay(450);target.hidden=true;say(job.demo?'动作还不错吧？你的文件都好好的。':`${job.names.length} 个文件处理好了。需要的话，还能从回收站找回来。`);await delay(400);}
  shredding=false;play('Idle');
}
function applyState(state){settings=state.settings;if(!settings.voiceEnabled)voice.stop();document.querySelector('#pet-status').textContent=state.runtime?.capturing?'ICEY / 正在读取屏幕':settings.visionEnabled&&settings.modelVision&&settings.aiEnabled?'ICEY / 感知已授权':'ICEY / ONLINE';}
window.icey.onShred(job=>{queue.push(job);processQueue();});window.icey.onSay(job=>say(job.text));window.icey.onState(applyState);
window.icey.getState().then(applyState);
load().catch(error=>{document.querySelector('#loading').textContent='角色加载失败，请打开终端检查资源。';console.error(error);});
