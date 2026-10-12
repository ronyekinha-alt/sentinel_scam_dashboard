import { writeFile } from 'node:fs/promises';
import Core from './sentinel-core.js';
import Backtest from './sentinel-backtest.js';

const requestedSymbol=String(process.argv[2]||'').trim().toUpperCase().replace(/USDT$/,'');
const symbols=['NEAR','ONDO','LINK','ASTR','GRT','VET','RAY','INJ','ATOM','CKB','CRV','RONIN','PYTH','TAO'].filter(symbol=>!requestedSymbol||symbol===requestedSymbol).map(symbol=>`${symbol}USDT`);
if(!symbols.length)throw new Error('Ativo não faz parte do estudo solicitado.');
const windows=[30,60,90,120], targets=[5,10,15,20,30,40,50,60,70,80,90,100], leverages=[1,2,3,4,5,6,7,8,9,10], fixedStopPct=2.5;
const intervals=['1w','1d','4h','2h','1h'], warmupDays={'1w':370,'1d':220,'4h':40,'2h':20,'1h':10}, day=86400000, capitalBRL=300;
const strategies=['trend','aggressive-pullback','flexible-pullback-2h','ema-cross-retest-2h','compression-expansion-1h'];
const timeframes=['1h','2h','4h'], strategyTimeframes={trend:['2h','4h'],'aggressive-pullback':['2h'],'flexible-pullback-2h':['2h'],'ema-cross-retest-2h':['2h'],'compression-expansion-1h':['1h']}, priority=new Map(strategies.map((name,index)=>[name,index]));
const asOf=Date.now(), allStart=asOf-120*day;

async function fetchCandles(symbol,interval,from){
  const rows=[];let cursor=from;
  for(let page=0;page<12&&cursor<asOf;page++){
    let response;let lastError;
    for(let attempt=0;attempt<3;attempt++)try{response=await fetch(`${Core.SOURCES.spot}/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${asOf}&limit=1000`,{signal:AbortSignal.timeout(30000)});if(response.ok)break;lastError=new Error(`HTTP ${response.status}`);}catch(error){lastError=error;}
    if(!response?.ok)throw new Error(`${symbol} ${interval}: ${lastError?.message||'consulta indisponível'}`);
    const batch=await response.json();if(!Array.isArray(batch)||!batch.length)break;rows.push(...batch);
    const next=Number(batch.at(-1)[6])+1;if(next<=cursor||batch.length<1000)break;cursor=next;
  }
  return Core.closedCandles(rows,asOf);
}
function settles(series,trade,targetPct,end){
  const candles=series[trade.timeframe]||[], start=candles.findIndex(candle=>candle.time===trade.time);
  if(start<0)return null;const target=trade.entry*(1+targetPct/100),stop=trade.entry*(1-fixedStopPct/100);
  for(let index=start;index<candles.length&&candles[index].closeTime<=end;index++){
    const candle=candles[index];
    if(candle.low<=stop)return {result:'loss',returnPct:-fixedStopPct,exitTime:candle.closeTime};
    if(candle.high>=target)return {result:'win',returnPct:targetPct,exitTime:candle.closeTime};
  }
  return {result:'open',returnPct:null,exitTime:end};
}
function selectedCandidates(series,start,end){
  const raw=strategies.flatMap(strategy=>Backtest.simulate(series,'ESTUDO',start,end,strategyTimeframes[strategy],[strategy],{minScore:0,enforceRiskPolicy:true,longOnly:true})).flatMap(result=>result.trades.map(trade=>({...trade,strategy:result.strategy,timeframe:result.timeframe})));
  const unique=new Map();
  raw.filter(trade=>trade.time>=start&&trade.time<=end&&trade.direction!=='SHORT').sort((a,b)=>a.time-b.time||priority.get(a.strategy)-priority.get(b.strategy)).forEach(trade=>{const key=`${trade.time}|${trade.timeframe}`;if(!unique.has(key))unique.set(key,trade);});
  return [...unique.values()].sort((a,b)=>a.time-b.time||priority.get(a.strategy)-priority.get(b.strategy));
}
function runTargetGrid(series,candidates,targetPct,start,end){
  const settled=[];let availableAt=start;
  for(const trade of candidates){if(trade.time<availableAt)continue;const outcome=settles(series,trade,targetPct,end);if(!outcome)continue;settled.push({...trade,...outcome});availableAt=outcome.result==='open'?end+1:outcome.exitTime+1;}
  const closed=settled.filter(trade=>trade.result!=='open'),wins=closed.filter(trade=>trade.result==='win').length,losses=closed.length-wins;
  const balances=Object.fromEntries(leverages.map(leverage=>[`${leverage}x`,closed.reduce((balance,trade)=>balance*(1+Math.max(-100,trade.returnPct*leverage)/100),capitalBRL)]));
  return {signals:candidates.length,trades:settled.length,closed:wins+losses,wins,losses,open:settled.length-closed.length,winRatePct:closed.length?wins/closed.length*100:null,gainPct:closed.length?wins/closed.length*targetPct:0,lossPct:closed.length?losses/closed.length*(targetPct/2):0,netReturnPct:closed.length?closed.reduce((sum,trade)=>sum+trade.returnPct,0):0,balances};
}
function summaryForMarkdown(report){
  const rows=[];
  for(const [days,period] of Object.entries(report.periods))for(const [symbol,asset] of Object.entries(period.assets)){
    const valid=Object.entries(asset.targets).filter(([,result])=>result.closed>0).sort((a,b)=>b[1].balances['1x']-a[1].balances['1x']);
    const [target,result]=valid[0]||[];rows.push(`| ${days}d | ${symbol.replace('USDT','')} | ${target?`${target}%`:'—'} | ${result?.closed||0} | ${result?.winRatePct==null?'—':`${result.winRatePct.toFixed(1)}%`} | ${result?`R$ ${result.balances['1x'].toFixed(2)}`:'—'} | ${result?`R$ ${result.balances['10x'].toFixed(2)}`:'—'} |`);
  }
  return rows.join('\n');
}

const report={generatedAt:new Date(asOf).toISOString(),source:Core.SOURCES.spot,capitalBRLPerAsset:capitalBRL,symbols:symbols.map(symbol=>symbol.replace('USDT','')),windows,targetsPct:targets,fixedStopPct,leverageSimulation:leverages,method:'Entradas vêm dos cinco setups atuais e seus gatilhos 1H/2H/4H, apenas candles fechados. Para cada alvo fixo, o stop é sempre -2,5%. Em vela que toca stop e alvo, o stop prevalece. Uma posição por ativo de cada vez; sinais abertos ao fim ficam fora do saldo reinvestido.',limitations:['Sem taxas, spread, slippage, funding, liquidação ou variação cambial.','Estudo de sensibilidade de alvo; não é promessa de retorno nem recomendação de alavancagem.','O valor de R$ 300 é independente por ativo, sem divisão entre os 14 ativos.'],periods:{},failures:[]};
const historical={};
await Promise.all(symbols.map(async symbol=>{
  try{historical[symbol]=Object.fromEntries(await Promise.all(intervals.map(async interval=>[interval,await fetchCandles(symbol,interval,allStart-warmupDays[interval]*day)])));console.log(`Dados carregados: ${symbol}`);}
  catch(error){report.failures.push({symbol,error:error.message});console.error(`Falha ${symbol}: ${error.message}`);}
}));
const candidatesBySymbol=Object.fromEntries(Object.entries(historical).map(([symbol,series])=>[symbol,selectedCandidates(series,allStart,asOf)]));
for(const days of windows){
  const start=asOf-days*day,assets={};
  for(const symbol of Object.keys(historical)){
    const candidates=(candidatesBySymbol[symbol]||[]).filter(candidate=>candidate.time>=start), targetResults=Object.fromEntries(targets.map(target=>[target,runTargetGrid(historical[symbol],candidates,target,start,asOf)]));
    assets[symbol]={signals:candidates.length,targets:targetResults};console.log(`${days}d ${symbol}: ${candidates.length} sinal(is)`);
  }
  report.periods[days]={start:new Date(start).toISOString(),end:new Date(asOf).toISOString(),assets};
}
const date=new Date(asOf).toISOString().slice(0,10),suffix=requestedSymbol?`-${requestedSymbol}`:'',jsonFile=`backtest-tp2r-isolado-${date}${suffix}.json`,mdFile=`backtest-tp2r-isolado-${date}${suffix}.md`;
await writeFile(jsonFile,`${JSON.stringify(report,null,2)}\n`);
await writeFile(mdFile,`# Backtest isolado — alvos fixos e stop de 2,5%\n\nGerado em ${new Date(asOf).toLocaleString('pt-BR')}. Capital inicial: **R$ 300 por ativo**, independentemente. O JSON anexo contém todos os alvos (5% a 100%), stop fixo de -2,5% e projeções de 1× a 10×.\n\n## Melhor alvo por ativo e período, em 1×\n\n| Janela | Ativo | Alvo | Trades fechados | Acerto | Saldo 1× | Projeção 10× |\n|---|---|---:|---:|---:|---:|---:|\n${summaryForMarkdown(report)}\n\n## Método e limites\n\n- As entradas são os cinco setups atuais em candles fechados, nos gatilhos 1H, 2H e 4H; sinais simultâneos são deduplicados e há uma posição por ativo por vez.\n- Os alvos são +5%, +10%, +15% até +100%; o stop é sempre -2,5%. Quando ambos são tocados na mesma vela, o stop prevalece.\n- Saldo reinvestido aplica o retorno de cada trade fechado sobre o saldo anterior. A coluna 10× é uma projeção matemática de retorno multiplicado, não uma recomendação de alavancagem.\n- Não inclui taxas, spread, slippage, funding, liquidação ou imposto; resultados com poucos trades não são robustos.\n`);
console.log(JSON.stringify({jsonFile,mdFile,failures:report.failures.length}));

