import { writeFile } from 'node:fs/promises';
import Core from './sentinel-core.js';
import Backtest from './sentinel-backtest.js';
const [symbol='SOLUSDT',startDate,endDate,strategy='trend',timeframe='2h',score='90',output='backtest-result.json']=process.argv.slice(2);
if(!startDate||!endDate)throw new Error('Uso: node backtest-cli.mjs SOLUSDT 2026-09-01 2026-09-29 trend 2h 90 resultado.json');
if(!/^[A-Z0-9]{5,18}$/.test(symbol))throw new Error('Par inválido.');
const start=new Date(`${startDate}T00:00:00-03:00`).getTime(),end=new Date(`${endDate}T23:59:59-03:00`).getTime(),minScore=Core.settings({minScore:Number(score)}).minScore;
if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw new Error('Datas inválidas.');
const day=86400000,days=Math.max(7,Math.ceil((end-start)/day));
async function candles(interval,from){const rows=[];let cursor=from;for(let guard=0;guard<12&&cursor<Date.now();guard++){const response=await fetch(`${Core.SOURCES.spot}/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${Date.now()}&limit=1000`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Binance HTTP ${response.status}`);const batch=await response.json();if(!batch.length)break;rows.push(...batch);const next=Number(batch.at(-1)[6])+1;if(next<=cursor||batch.length<1000)break;cursor=next;}return Core.closedCandles(rows);}
const intervals=['1w','1d','4h','2h','1h'],warmup=[2600,days+230,days+60,days+35,days+25],series=Object.fromEntries(await Promise.all(intervals.map(async(tf,i)=>[tf,await candles(tf,start-warmup[i]*day)])));
const result=Backtest.simulate(series,symbol,start,end,[timeframe],[strategy],{minScore});
await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({output,evaluated:result[0].evaluated,trades:result[0].trades.length}));
