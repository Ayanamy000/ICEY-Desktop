const {validateEndpoint}=require('./chat.cjs');
async function synthesize({text,settings:s,signal}){
  if(!s.voiceEnabled||s.voiceProvider!=='gptsovits')throw new Error('自定义语音尚未启用');
  if(typeof text!=='string'||!text.trim()||text.length>1000)throw new Error('朗读文本应为1–1000字');
  if(!s.ttsReference)throw new Error('请填写语音服务端可读取的参考音频路径');
  const response=await fetch(validateEndpoint(s.ttsEndpoint)+'/tts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,text_lang:'zh',ref_audio_path:s.ttsReference,prompt_lang:'zh',prompt_text:s.ttsPrompt,speed_factor:s.voiceRate,media_type:'wav',streaming_mode:false}),signal,redirect:'error'});
  if(!response.ok)throw new Error('语音服务返回 HTTP '+response.status);
  const type=response.headers.get('content-type')||'';if(!/audio\/|application\/octet-stream/.test(type))throw new Error('语音服务没有返回音频');
  const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>12*1024*1024)throw new Error('语音响应过大');chunks.push(chunk);}
  const data=Buffer.concat(chunks);if(data.length<12||data.toString('ascii',0,4)!=='RIFF'||data.toString('ascii',8,12)!=='WAVE')throw new Error('语音服务没有返回有效 WAV');
  return {mime:'audio/wav',base64:data.toString('base64')};
}
module.exports={synthesize};
