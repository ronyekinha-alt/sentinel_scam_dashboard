import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Core from './sentinel-core.js';

const root=path.dirname(fileURLToPath(import.meta.url));
const stateFile=path.join(root,'signal-state.json');
const TELEGRAM=`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;
const CHAT_ID=process.env.TELEGRAM_CHAT_ID;
const FORCE_ALERT=String(process.env.FORCE_ALERT).toLowerCase()==='true';
const DISCOVER_CHAT=String(process.env.DISCOVER_CHAT).toLowerCase()==='true';
export async function getJson(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${new URL(url).hostname} respondeu HTTP ${response.status}`);
  return response.json();
}
export function messageFor(signals) {
  const money=value=>Number(value).toLocaleString('pt-BR',{minimumFractionDigits:value<1?5:2,maximumFractionDigits:value<1?5:2});
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const lines=['🚨 <b>SENTINEL TRADE · SINAIS LONG</b>',new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),''];
  signals.forEach((s,i)=>lines.push('━━━━━━━━━━━━━━',`🟢 <b>${i+1}) ${escape(s.symbol.replace('USDT',''))}/USDT · LONG</b>`,`🧭 ${escape(s.strategyName)} · gatilho ${s.timeframe}`,`⭐ Score de confluência: <b>${s.score}/100</b>`,`🏦 BINANCE · ${s.vehicle} ${s.leverage}`,`🟦 Entrada: <b>US$ ${money(s.entry)}</b>`,`🛑 Stop: <b>US$ ${money(s.stop)}</b>`,`🎯 TP 2R: <b>US$ ${money(s.tp2)}</b> · TP 3R: <b>US$ ${money(s.tp3)}</b>`,`📊 ${escape(s.trigger)}`,''));
  lines.push('⚠️ <i>Sinal analítico; confirme o contexto antes de operar.</i>');
  return lines.join('\n');
}
async function sendTelegram(text) {
  const response=await fetch(`${TELEGRAM}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:CHAT_ID,text,parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`Telegram respondeu HTTP ${response.status}`);
  const payload=await response.json();if(!payload.ok)throw new Error(payload.description||'Telegram recusou a mensagem.');
}
async function discoverChats() {
  const payload=await getJson(`${TELEGRAM}/getUpdates?allowed_updates=${encodeURIComponent('["message"]')}`);
  const chats=[...new Map((payload.result||[]).map(u=>u.message?.chat).filter(c=>c&&['group','supergroup'].includes(c.type)).map(c=>[c.id,c])).values()];
  await sendTelegram(chats.length?chats.map(c=>`chat_id: <code>${c.id}</code>`).join('\n'):'Nenhum grupo encontrado; envie /start no grupo e repita.');
}
async function loadState(){try{return JSON.parse(await readFile(stateFile,'utf8'));}catch(error){if(error.code==='ENOENT')return {};throw new Error('Histórico de alertas inválido; execução interrompida para evitar duplicação.');}}
async function saveState(state){await writeFile(stateFile,JSON.stringify(state,null,2)+'\n');}
export async function main(dependencies={}) {
  const read=dependencies.getJson||getJson,send=dependencies.send||sendTelegram,load=dependencies.loadState||loadState,save=dependencies.saveState||saveState;
  if(!dependencies.send&&(!process.env.TELEGRAM_BOT_TOKEN||!CHAT_ID))throw new Error('Segredos TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID não configurados.');
  if(DISCOVER_CHAT){await discoverChats();return;}
  const config=Core.settings({minScore:Number(process.env.MIN_SCORE||90),strategy:process.env.SCANNER_STRATEGY||'both',minVolume:Number(process.env.MIN_VOLUME||1000000),assetLimit:Number(process.env.ASSET_LIMIT||1000)});
  const result=await (dependencies.scan||Core.scanMarket)(read,config), state=await load(), now=Date.now(), sent=state.sent||{};
  for(const [symbol,item] of Object.entries(sent))if(now-item.at>7*86400000)delete sent[symbol];
  const fresh=result.signals.filter(s=>FORCE_ALERT||Core.isFresh(s,sent[s.symbol],now));
  // Small batches remain below Telegram's message limit and persist after each successful delivery.
  for(let i=0;i<fresh.length;i+=3){const batch=fresh.slice(i,i+3);await send(messageFor(batch));batch.forEach(s=>{sent[s.symbol]={at:now,entry:s.entry,candleTime:s.candleTime,score:s.score,strategy:s.strategy};});await save({sent});}
  if(!fresh.length&&FORCE_ALERT)await send('🧪 <b>TESTE DO SENTINEL TRADE</b>\nConexão funcionando; nenhum novo setup atingiu os filtros nesta consulta.');
  await save({sent});
  const summary={engineVersion:Core.VERSION,config,universe:result.assets,found:result.signals.length,sent:fresh.length,failures:result.failures,warnings:result.warnings,symbols:fresh.map(s=>s.symbol)};
  console.log(JSON.stringify(summary));return summary;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
