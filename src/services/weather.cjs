async function json(url){const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error'});if(!response.ok)throw new Error('天气服务返回 HTTP '+response.status);return response.json();}
const descriptions={0:'晴',1:'晴间多云',2:'多云',3:'阴',45:'有雾',48:'冻雾',51:'小毛毛雨',53:'毛毛雨',55:'较强毛毛雨',61:'小雨',63:'中雨',65:'大雨',71:'小雪',73:'中雪',75:'大雪',80:'阵雨',81:'较强阵雨',82:'强阵雨',95:'雷暴',96:'雷暴伴冰雹',99:'强雷暴伴冰雹'};
async function getWeather(city){
  if(typeof city!=='string'||!city.trim()||city.length>80)throw new Error('城市名称无效');
  const locations=await json('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:city.trim(),count:'5',language:'zh',format:'json'}));
  const place=locations.results?.find(item=>item.name===city.trim())||locations.results?.[0];
  if(!place||!Number.isFinite(place.latitude)||!Number.isFinite(place.longitude))throw new Error('天气服务没有找到城市：'+city);
  const query=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',daily:'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',timezone:place.timezone||'auto',forecast_days:'3'});
  const forecast=await json('https://api.open-meteo.com/v1/forecast?'+query);
  const current=forecast.current,daily=forecast.daily;
  if(!current||!daily?.time?.length)throw new Error('天气服务没有返回有效预报');
  const localDate=current.time?.slice(0,10),index=Math.max(0,daily.time.indexOf(localDate));
  const code=daily.weather_code?.[index]??current.weather_code;
  return `${place.name}天气（${daily.time[index]}）：${descriptions[code]||'天气代码 '+code}，当前 ${current.temperature_2m}°C，今日 ${daily.temperature_2m_min[index]}–${daily.temperature_2m_max[index]}°C，降水概率最高 ${daily.precipitation_probability_max?.[index]??'未知'}%。来源：Open-Meteo。`;
}
module.exports={getWeather};
