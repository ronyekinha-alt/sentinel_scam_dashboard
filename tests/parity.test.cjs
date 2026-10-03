const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Core=require('../sentinel-core.js'),Backtest=require('../sentinel-backtest.js');
const root=path.resolve(__dirname,'..'),browser=vm.createContext({window:{},Date,console});
vm.runInContext(fs.readFileSync(path.join(root,'sentinel-core.js'),'utf8'),browser);
vm.runInContext(fs.readFileSync(path.join(root,'sentinel-backtest.js'),'utf8'),browser);
const web=browser.window.SentinelCore,webBt=browser.window.SentinelBacktest;
const plain=v=>JSON.parse(JSON.stringify(v));
function fixtures(){
 const series=Object.fromEntries(Core.INTERVALS||['1w','1d','4h','2h','1h'].map(tf=>[tf,Array.from({length:210},(_,i)=>({time:i*3600000,closeTime:(i+1)*3600000-1,open:99,close:100,high:101,low:98,volume:100,takerBuyVolume:60}))]));
 const base={close:100,ema9:99,ema22:98,ema51:97,ema80:96,rsi:55,atr:2,adx:25,macdHistogram:1,aligned:true,rising:true,momentum:true,relativeVolume:1.5,strong:true,pivot:{bullish:true},pattern:{name:'Engolfo de alta',bullish:true},recentLow:98,levels:{support:98,resistance:null},buyerDominance:true};
 const analyses={weekly:{...base},day:{...base},four:{...base},two:{...base},one:{...base},extension:{weekly:{...base},blocked:false,rise12:20}};
 return {series,analyses,asset:{symbol:'TESTUSDT',rank:1,volume:2000000}};
}
test('score permite somente 90 e 100, sem override por estratégia experimental',()=>{for(const score of [80,89,95,101])assert.throws(()=>Core.settings({minScore:score}));assert.equal(Core.settings({minScore:100}).minScore,100);assert.throws(()=>Core.settings({strategy:'breakout-30-2h-retest'}));});
const patterns=[['Engolfo de alta',[{open:101,close:99,high:102,low:98},{open:98,close:102,high:103,low:97}]],['Martelo comprador',[{open:100,close:101,high:103,low:99},{open:100,close:101,high:102,low:97}]],['Rompimento de máxima',[{open:99,close:100,high:101,low:98},{open:100,close:102,high:103,low:99}]]];
for(const [name,candles] of patterns)test('mesmo padrão e sinal nos dois ambientes: '+name,()=>{assert.equal(Core.candlePattern(candles).name,name);assert.deepEqual(plain(Core.candlePattern(candles)),plain(web.candlePattern(candles)));for(const strategy of ['trend','aggressive-pullback','flexible-pullback-2h']){const f=fixtures();f.analyses.two.pattern={name,bullish:true};const node=Core.evaluateAnalyses(f.asset,f.series,f.analyses,strategy),ui=web.evaluateAnalyses(f.asset,f.series,f.analyses,strategy);assert(node);assert.deepEqual(plain(ui),plain(node));}});
for(const [label,mutate] of [
 ['sem padrão',f=>{f.analyses.two.pattern={bullish:false};f.analyses.two.pivot={bullish:false};}],
 ['macro diário desalinhado',f=>f.analyses.day.aligned=false],
 ['macro 4H sem inclinação',f=>f.analyses.four.rising=false],
 ['1H sem momentum',f=>f.analyses.one.momentum=false],
 ['euforia semanal',f=>f.analyses.extension.blocked=true],
 ['RSI esticado',f=>f.analyses.two.rsi=68],
 ['distância EMA',f=>f.analyses.two.ema9=88],
 ['alta recente',f=>f.series['2h'][202].low=90],
 ['resistência antes de 2R',f=>f.analyses.two.levels={resistance:101}],
 ['risco superior a 8%',f=>f.series['2h'][207].low=90]
])test('ambos bloqueiam '+label,()=>{const f=fixtures();mutate(f);for(const engine of [Core,web])assert.equal(engine.evaluateAnalyses(f.asset,f.series,f.analyses,'trend'),null);});
test('score 91 passa no limiar 90 e é rejeitado no 100',()=>{const f=fixtures();f.analyses.two={...f.analyses.two,strong:false,pivot:{bullish:false},relativeVolume:1};for(const engine of [Core,web]){assert.equal(engine.evaluateAnalyses(f.asset,f.series,f.analyses,'trend',{minScore:90}).score,91);assert.equal(engine.evaluateAnalyses(f.asset,f.series,f.analyses,'trend',{minScore:100}),null);}});
test('resistência exatamente 2R é aceita, inferior rejeitada',()=>{const f=fixtures(),signal=Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend');f.analyses.two.levels={resistance:signal.tp2};assert(Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend'));f.analyses.two.levels.resistance-=.001;assert.equal(Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend'),null);});
test('candle só entra após seu fechamento real, sem excluir o último fechado',()=>{const row=(time,closeTime)=>[time,'100','102','98','101','10',closeTime,0,0,'6'];const raw=[row(0,1999),row(2000,3999),row(4000,5999)];assert.deepEqual(Core.closedCandles(raw,4000).map(c=>c.time),[0,2000]);assert.deepEqual(Core.closedCandles(raw,3999).map(c=>c.time),[0]);});
test('2H nativo é buscado, com corte fixo de horário e sem blocos incompletos',async()=>{const urls=[];await Core.fetchSeries(async url=>{urls.push(url);return [];},'TESTUSDT',10000);assert.equal(urls.length,5);assert(urls.some(u=>u.includes('interval=2h')));assert(urls.every(u=>u.startsWith(Core.SOURCES.spot)&&u.includes('endTime=9999')));});
test('ranking não substitui volume USDT do par; fallback por volume mantém o universo',async()=>{
 const provider=async url=>{if(url.endsWith('/exchangeInfo'))return {symbols:['HIGHUSDT','LOWUSDT'].map(symbol=>({symbol,status:'TRADING',quoteAsset:'USDT',isSpotTradingAllowed:true}))};if(url.endsWith('/ticker/24hr'))return [{symbol:'HIGHUSDT',quoteVolume:'1000000'},{symbol:'LOWUSDT',quoteVolume:'999999'}];return [{symbol:'low',name:'Low',market_cap_rank:1,total_volume:1000000000},{symbol:'high',name:'High',market_cap_rank:2,total_volume:1}];};
 const result=await Core.marketUniverse(provider,{assetLimit:50});assert.deepEqual(result.assets.map(a=>a.symbol),['HIGHUSDT']);assert.deepEqual(plain(result),plain(await web.marketUniverse(provider,{assetLimit:50})));
 const fallback=async url=>{if(url.includes('coingecko'))throw new Error('429');return provider(url);};const fallbackResult=await Core.marketUniverse(fallback,{assetLimit:50});assert.match(fallbackResult.mode,/fallback/);assert.deepEqual(plain(fallbackResult),plain(await web.marketUniverse(fallback,{assetLimit:50})));
});
function rankingProvider({cg=[],cmc=[],failCg=false,failCmc=false}={}){
 return async url=>{
  if(url.endsWith('/exchangeInfo'))return {symbols:['SHAREDUSDT','CGONLYUSDT','CMCONLYUSDT','LOWUSDT','OUTUSDT','DUPUSDT'].map(symbol=>({symbol,status:'TRADING',quoteAsset:'USDT',isSpotTradingAllowed:true}))};
  if(url.endsWith('/ticker/24hr'))return ['SHAREDUSDT','CGONLYUSDT','CMCONLYUSDT','LOWUSDT','OUTUSDT','DUPUSDT'].map(symbol=>({symbol,quoteVolume:symbol==='LOWUSDT'?999999:2000000}));
  if(url.includes('coingecko')){if(failCg)throw new Error('403');return cg;}
  if(url.includes('coinmarketcap')){if(failCmc)throw new Error('429');assert(url.includes('sort=market_cap'));return {status:{error_code:'0'},data:cmc};}
  throw new Error('Consulta inesperada');
 };
}
const cgCoin=(symbol,rank)=>({symbol,name:symbol,market_cap_rank:rank});
const cmcCoin=(symbol,rank)=>({symbol,name:symbol,cmc_rank:rank});
test('união dos rankings inclui ativo exclusivo CMC e exclusivo CG, sem duplicação',async()=>{
 const provider=rankingProvider({cg:[cgCoin('shared',1),cgCoin('cgonly',2)],cmc:[cmcCoin('SHARED',2),cmcCoin('CMCONLY',1)]});
 const result=await Core.marketUniverse(provider,{assetLimit:2});assert.equal(result.assets.length,3);assert.deepEqual(result.assets.map(a=>a.symbol),['CMCONLYUSDT','SHAREDUSDT','CGONLYUSDT']);
 const shared=result.assets.find(a=>a.symbol==='SHAREDUSDT');assert.deepEqual(shared.rankings,{CoinGecko:1,CoinMarketCap:2});assert.equal(Core.rankingLabel(shared),'CoinGecko #1 · CoinMarketCap #2');assert.deepEqual(plain(result),plain(await web.marketUniverse(provider,{assetLimit:2})));
});
test('ranking respeita posição top N antes de filtrar volume e ignora ranking nulo',async()=>{
 const provider=rankingProvider({cg:[cgCoin('shared',1),cgCoin('out',3)],cmc:[cmcCoin('LOW',1),cmcCoin('OUT',null)]});
 const result=await Core.marketUniverse(provider,{assetLimit:2});assert.deepEqual(result.assets.map(a=>a.symbol),['SHAREDUSDT']);
});
test('CoinGecko indisponível mantém CMC e sinaliza cobertura parcial',async()=>{
 const result=await Core.marketUniverse(rankingProvider({failCg:true,cmc:[cmcCoin('CMCONLY',1000)]}));assert.equal(result.mode,'market cap (CoinMarketCap)');assert.equal(result.assets[0].symbol,'CMCONLYUSDT');assert(result.warnings.some(w=>w.includes('CoinGecko: 403')));
});
test('CMC indisponível mantém CoinGecko; falha dupla usa fallback por volume',async()=>{
 const result=await Core.marketUniverse(rankingProvider({cg:[cgCoin('cgonly',1)],failCmc:true}));assert.equal(result.mode,'market cap (CoinGecko)');assert(result.warnings.some(w=>w.includes('CoinMarketCap: 429')));
 const fallback=await Core.marketUniverse(rankingProvider({failCg:true,failCmc:true}));assert.match(fallback.mode,/fallback/);assert(fallback.warnings.some(w=>w.includes('fallback')));
});
test('símbolo CMC ambíguo não atribui ranking ao par errado',async()=>{
 const result=await Core.marketUniverse(rankingProvider({cg:[cgCoin('shared',1)],cmc:[cmcCoin('DUP',1),cmcCoin('DUP',2)]}),{assetLimit:2});assert.equal(result.assets.length,1);assert(result.warnings.some(w=>w.includes('ambíguo DUPUSDT')));
});
test('ranking CMC não altera score técnico e identificação aparece no Telegram',async()=>{
 const f=fixtures();f.asset.rankings={CoinMarketCap:900};f.asset.rankingSources=['CoinMarketCap'];const enriched=Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend');const plainSignal=Core.evaluateAnalyses({...f.asset,rankings:{}},f.series,f.analyses,'trend');assert.equal(enriched.score,plainSignal.score);assert.deepEqual(plain(enriched),plain(web.evaluateAnalyses(f.asset,f.series,f.analyses,'trend')));const {messageFor}=await import('../telegram-scanner.mjs');assert(messageFor([{...enriched,vehicle:'SPOT',leverage:'1×'}]).includes('CoinMarketCap #900'));
});
test('Binance é prioritária; ausência do par usa OKX e volume USDT da OKX',async()=>{
 const provider=rankingProvider({cmc:[cmcCoin('SHARED',1),cmcCoin('OKXONLY',2),cmcCoin('OKXLOW',3)]});
 const get=async url=>{if(url.includes('/public/instruments'))return {code:'0',data:['SHARED','OKXONLY','OKXLOW'].map(baseCcy=>({baseCcy,quoteCcy:'USDT',instId:baseCcy+'-USDT',state:'live'}))};if(url.includes('/market/tickers'))return {code:'0',data:[{instId:'SHARED-USDT',volCcy24h:9000000},{instId:'OKXONLY-USDT',volCcy24h:1000000},{instId:'OKXLOW-USDT',volCcy24h:999999}]};return provider(url);};
 const result=await Core.marketUniverse(get);assert.deepEqual(result.assets.map(a=>[a.symbol,a.source,a.volume]),[['SHAREDUSDT','BINANCE',2000000],['OKXONLYUSDT','OKX',1000000]]);assert.equal(result.assets[1].exchangeSymbol,'OKXONLY-USDT');assert.deepEqual(plain(result),plain(await web.marketUniverse(get)));
});
test('OKX retorna ordem inversa: motor ordena e rejeita vela aberta ou não confirmada',()=>{
 const row=(time,confirm)=>[String(time),'100','102','98','101','10','1000','1000',confirm],raw=[row(7200000,'0'),row(0,'1'),row(3600000,'1')];
 const result=Core.closedOkxCandles(raw,'1h',7200000);assert.deepEqual(result.map(c=>c.time),[0,3600000]);assert(result.every(c=>c.takerBuyVolume===null));assert.deepEqual(plain(result),plain(web.closedOkxCandles(raw,'1h',7200000)));assert.equal(Core.closedOkxCandles(raw,'1h',3599999).length,0);
});
test('OKX busca candles nativos UTC 1W/1D, 4H/2H/1H com corte único',async()=>{
 const urls=[];await Core.fetchSeries(async url=>{urls.push(url);return {code:'0',data:[]};},'OKXONLY-USDT',10000,Core.SOURCES.okx);assert.equal(urls.length,5);assert(urls.every(u=>u.includes('instId=OKXONLY-USDT')&&u.includes('after=10000')));assert(urls.some(u=>u.includes('bar=1Wutc')));assert(urls.some(u=>u.includes('bar=1Dutc')));assert(urls.some(u=>u.includes('bar=2H')));
});
test('setup OKX preserva fonte e score, sem misturar futuros Binance',async()=>{
 const f=fixtures();f.asset.source='OKX';f.asset.exchangeSymbol='TEST-USDT';const s=Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend');assert.equal(s.source,'OKX');assert.deepEqual(plain(s),plain(web.evaluateAnalyses(f.asset,f.series,f.analyses,'trend')));const checked=await Core.vehicle(async()=>{throw new Error('Não consultar Binance para sinal OKX');},s,10000);assert.equal(checked.vehicle,'SPOT');assert(!checked.vehicleWarning);assert(checked.vehicleReason.includes('OKX'));const {messageFor}=await import('../telegram-scanner.mjs');assert(messageFor([checked]).includes('🏦 OKX'));
});
test('futuros indisponíveis não apagam sinal SPOT confirmado',async()=>{const f=fixtures(),s=Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend'),result=await Core.vehicle(async()=>{throw new Error('HTTP 400');},s,Date.now());assert.equal(result.vehicle,'SPOT');assert.equal(result.entry,s.entry);assert(result.vehicleWarning);});
test('falha total de candles é erro; não é ausência saudável de setups',async()=>{const provider=async url=>{if(url.endsWith('/time'))return {serverTime:Date.now()};if(url.endsWith('/exchangeInfo'))return {symbols:[{symbol:'TESTUSDT',status:'TRADING',quoteAsset:'USDT',isSpotTradingAllowed:true}]};if(url.endsWith('/ticker/24hr'))return [{symbol:'TESTUSDT',quoteVolume:2000000}];if(url.includes('coingecko'))return [{symbol:'test',name:'Test',market_cap_rank:1}];throw new Error('503');};await assert.rejects(Core.scanMarket(provider,{assetLimit:50}),/Todas as 1 consultas/);});
test('deduplicação: mesma vela, janela 12h, variação 1,5%',()=>{const signal={symbol:'TESTUSDT',entry:100,candleTime:10},previous={entry:100,candleTime:10,at:0};assert.equal(Core.isFresh(signal,previous,13*3600000),false);assert.equal(Core.isFresh({...signal,candleTime:11},previous,11*3600000),false);assert.equal(Core.isFresh({...signal,candleTime:11},previous,13*3600000),true);assert.equal(Core.isFresh({...signal,candleTime:11,entry:102},previous,3600000),true);});
test('consolidação prioriza score, tendência no empate e um sinal por ativo',()=>{const r=Core.consolidate([{symbol:'TESTUSDT',score:95,strategy:'aggressive-pullback'},{symbol:'TESTUSDT',score:95,strategy:'trend'},{symbol:'OTHERUSDT',score:100,strategy:'trend'}]);assert.deepEqual(r.map(s=>s.symbol),['OTHERUSDT','TESTUSDT']);assert.equal(r[1].strategy,'trend');});
test('EMA, RSI, MACD, ADX e score calculados igualmente no navegador e Node',()=>{const candles=Array.from({length:210},(_,i)=>{const close=100+i*.03+Math.sin(i)*.4;return {time:i*3600000,open:close-.1,high:close+.3,low:close-.3,close,volume:100+i%5,takerBuyVolume:60};});assert.deepEqual(plain(Core.analyseTimeframe(candles)),plain(web.analyseTimeframe(candles)));});
test('histórico usa fechamento macro, sem acesso ao candle aberto',()=>{const series=Array.from({length:215},(_,i)=>({time:i*100,closeTime:(i+1)*100-1}));const history=Backtest.historyUntil(series,21000);assert.equal(history.at(-1).time,20900);});
test('todos os setups experimentais compartilham backtest idêntico nos dois ambientes',()=>{const f=fixtures(),strategies=['trend','aggressive-pullback','legacy-pullback-1h','refined-early-ema-rsi','refined-moderate-ema-rsi','refined-intermediate-ema-rsi','breakout-30-2h-close','breakout-30-2h-retest','breakout-30-2h-retest-fixed-3','breakout-30-2h-retest-fixed-4','breakout-30-2h-retest-fixed-7','breakout-60-2h-close','breakout-60-2h-retest','breakout-60-2h-retest-fixed-3','breakout-60-2h-retest-fixed-4','breakout-60-2h-retest-fixed-7','expansion-retest-2h'];for(const strategy of strategies){assert.deepEqual(plain(Backtest.historicalSetup(...['1w','1d','4h','2h','1h'].map(tf=>f.series[tf]),strategy,'2h')),plain(webBt.historicalSetup(...['1w','1d','4h','2h','1h'].map(tf=>f.series[tf]),strategy,'2h')));}});
test('Telegram mantém envio novo, deduplicação e estado sem enviar rede no teste',async()=>{const {main,messageFor}=await import('../telegram-scanner.mjs');const f=fixtures(),signal={...Core.evaluateAnalyses(f.asset,f.series,f.analyses,'trend'),vehicle:'SPOT',leverage:'1×'};let saved={},messages=[];const deps={scan:async()=>({signals:[signal],assets:1,failures:[],warnings:[]}),send:async text=>messages.push(text),loadState:async()=>saved,saveState:async data=>saved=structuredClone(data)};await main(deps);await main(deps);assert.equal(messages.length,1);assert(saved.sent.TESTUSDT);assert(messageFor([signal,signal,signal]).length<4096);deps.scan=async()=>({signals:[],assets:1,failures:[],warnings:[]});await main(deps);assert.equal(messages.length,1);});

