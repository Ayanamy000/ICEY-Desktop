function inQuietHours(hour,start,end){return start===end?false:start<end?hour>=start&&hour<end:hour>=start||hour<end;}
function canSpeak({settings:s,now,lastActivity,lastAttempt,locked,busy,idleSeconds,visible}){
  return !!(s.proactiveEnabled&&s.aiEnabled&&s.aiEndpoint&&s.aiModel&&!locked&&!busy&&visible&&idleSeconds<300&&!inQuietHours(new Date(now).getHours(),s.quietStart,s.quietEnd)&&now-lastActivity>=60000&&now-lastAttempt>=s.proactiveMinutes*60000);
}
module.exports={inQuietHours,canSpeak};
