const DEFAULT_CONTEXT_BUDGET=16384;
function contextBudget(value){return Number.isFinite(value)?Math.max(8192,Math.min(131072,Math.round(value))):DEFAULT_CONTEXT_BUDGET;}
// Providers use different tokenizers. This byte-based estimate is deliberately
// approximate; image tokens and generated output are outside the text budget.
function estimatedTokens(message){
  const content=typeof message.content==='string'?message.content:Array.isArray(message.content)?message.content.filter(part=>part.type==='text').map(part=>part.text||'').join('\n'):'';
  return Math.ceil(Buffer.byteLength(content,'utf8')/2)+8;
}
function fitContext(messages,budget){
  const limit=contextBudget(budget),costs=messages.map(estimatedTokens);
  let used=costs.reduce((sum,cost)=>sum+cost,3);
  const keep=messages.map(()=>true);
  // Keep every system instruction and the current request intact.
  for(let i=0;i<messages.length-1&&used>limit;i++){
    if(messages[i].role==='system'||messages[i].role==='developer')continue;
    keep[i]=false;used-=costs[i];
  }
  // A truncated history should not begin with an orphaned assistant reply.
  for(let i=0;i<messages.length-1;i++){
    if(!keep[i]||messages[i].role==='system'||messages[i].role==='developer')continue;
    if(messages[i].role!=='assistant')break;
    keep[i]=false;used-=costs[i];
  }
  if(used>limit)throw new Error(`当前消息与必要设定超出了 ${Math.round(limit/1024)}K 的上下文预算，请缩短内容或在模型温度下方调高 Token 预算`);
  return messages.filter((_,index)=>keep[index]);
}
module.exports={DEFAULT_CONTEXT_BUDGET,contextBudget,estimatedTokens,fitContext};
