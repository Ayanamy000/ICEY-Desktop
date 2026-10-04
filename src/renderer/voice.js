// Future provider contract: { speak(text, settings): Promise<void>, stop(): void }.
// A custom provider may call a TTS service and play the returned audio locally.
class VoiceService {
  constructor(){this.provider=null;this.generation=0;this.audio=null;}
  use(provider){if(!provider||typeof provider.speak!=='function'||typeof provider.stop!=='function')throw new Error('语音适配器需要 speak 和 stop 方法');this.stop();this.provider=provider;}
  stop(){this.generation++;this.audio?.pause();this.audio=null;window.icey.cancelVoice().catch(()=>{});if(this.provider)this.provider.stop();else window.speechSynthesis?.cancel();}
  async speak(text,settings){
    this.stop();if(!settings.voiceEnabled)return;
    if(this.provider)return this.provider.speak(text,settings);
    if(settings.voiceProvider==='gptsovits'){const generation=this.generation;const response=await window.icey.synthesize(text.slice(0,1000));if(generation!==this.generation)return;this.audio=new Audio(`data:${response.mime};base64,${response.base64}`);await this.audio.play();return;}
    if(!window.speechSynthesis)return;
    const utterance=new SpeechSynthesisUtterance(text.slice(0,1000));utterance.lang='zh-CN';utterance.rate=settings.voiceRate||1;
    const voice=speechSynthesis.getVoices().find(v=>v.name===settings.voiceName);if(voice)utterance.voice=voice;
    speechSynthesis.speak(utterance);
  }
}
window.iceyVoice=new VoiceService();
