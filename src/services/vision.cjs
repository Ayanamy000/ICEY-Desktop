function visionAllowed(s){return !!(s.aiEnabled&&s.modelVision&&s.visionEnabled);}
class Vision{
  constructor(desktopCapturer,screen){this.desktopCapturer=desktopCapturer;this.screen=screen;}
  displays(){const primary=String(this.screen.getPrimaryDisplay().id);return this.screen.getAllDisplays().map((d,index)=>({id:String(d.id),name:`${String(d.id)===primary?'主屏幕':`屏幕 ${index+1}`} · ${d.internal===true?'内置 · ':d.internal===false?'外接 · ':''}${d.size.width}×${d.size.height}`}));}
  async imageFor(id,size){
    const displays=this.screen.getAllDisplays();
    const chosen=id||String(this.screen.getPrimaryDisplay().id);
    if(!displays.some(d=>String(d.id)===chosen))throw new Error('选择的屏幕已断开，请刷新列表后重新选择');
    const sources=await this.desktopCapturer.getSources({types:['screen'],thumbnailSize:size,fetchWindowIcons:false});
    const source=sources.find(s=>String(s.display_id)===chosen)||
      (displays.length===1&&sources.length===1?sources[0]:null);
    if(!source||source.thumbnail.isEmpty())throw new Error('没有获得所选屏幕的画面，请检查屏幕连接或系统截图权限');
    const image=source.thumbnail.toJPEG(70);
    if(!image.length)throw new Error('所选屏幕的截图为空，请重试');
    return {dataUrl:'data:image/jpeg;base64,'+image.toString('base64'),size:source.thumbnail.getSize()};
  }
  async preview(id){return this.imageFor(id,{width:800,height:450});}
  async capture(settings){
    if(!visionAllowed(settings))throw new Error('桌面感知未授权，或尚未声明模型支持图片');
    return (await this.imageFor(settings.visionScreen,{width:1280,height:720})).dataUrl;
  }
}
module.exports={Vision,visionAllowed};
