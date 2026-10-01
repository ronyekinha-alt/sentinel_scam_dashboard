/* Motor único para painel e Telegram. */
(function(root,factory){if(typeof module==='object' && module.exports)module.exports=factory();else root.SentinelCore=factory();})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function last(values) { return values[values.length - 1]; }
function sma(values, period) { return values.map((_, i) => i < period - 1 ? null : values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period); }
function ema(values, period) { const out = Array(values.length).fill(null), k = 2 / (period + 1); let seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period; out[period - 1] = seed; for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k); return out; }
function rsi(values, period = 14) {
  const out = Array(values.length).fill(null); let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const delta = values[i] - values[i - 1]; gains += Math.max(delta, 0); losses += Math.max(-delta, 0); }
  let avgGain = gains / period, avgLoss = losses / period; out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) { const delta = values[i] - values[i - 1]; avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period; avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period; out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss); }
  return out;
}
function atr(candles, period = 14) { const tr = candles.map((c, i) => i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))); return ema(tr, period); }
function macd(values) { const fast = ema(values, 12), slow = ema(values, 26); const line = values.map((_, i) => fast[i] != null && slow[i] != null ? fast[i] - slow[i] : null); const valid = line.map(v => v ?? 0), signal = ema(valid, 9); return { line, signal, histogram: line.map((v, i) => v != null && signal[i] != null ? v - signal[i] : null) }; }
function adx(candles, period = 14) {
  const tr = [], plus = [], minus = [];
  candles.forEach((c, i) => { if (!i) { tr.push(0); plus.push(0); minus.push(0); return; } const prev = candles[i - 1], up = c.high - prev.high, down = prev.low - c.low; tr.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close))); plus.push(up > down && up > 0 ? up : 0); minus.push(down > up && down > 0 ? down : 0); });
  const smooth = (v) => ema(v, period); const aTr = smooth(tr), p = smooth(plus), m = smooth(minus); const dx = tr.map((_, i) => !aTr[i] ? 0 : 100 * Math.abs((100 * p[i] / aTr[i]) - (100 * m[i] / aTr[i])) / Math.max((100 * p[i] / aTr[i]) + (100 * m[i] / aTr[i]), .0001)); return ema(dx, period);
}
function readCandles(raw) { return raw.slice(0, -1).map(r => ({ time: r[0], open: +r[1], high: +r[2], low: +r[3], close: +r[4], volume: +r[5], takerBuyVolume: r[9] == null ? null : +r[9] })); }
function stochRsi(values, rsiPeriod = 14, stochPeriod = 14, smoothK = 3, smoothD = 3) {
  const rs = rsi(values, rsiPeriod), raw = rs.map((value, i) => { if (value == null || i < rsiPeriod + stochPeriod - 1) return 0; const part = rs.slice(i - stochPeriod + 1, i + 1), low = Math.min(...part), high = Math.max(...part); return high === low ? 0 : (value - low) / (high - low) * 100; });
  const k = sma(raw, smoothK), d = sma(k.map(v => v ?? 0), smoothD); return { k, d };
}
function candlePattern(candles) {
  const [prev, cur] = candles.slice(-2), body = Math.abs(cur.close - cur.open), range = Math.max(cur.high - cur.low, Number.EPSILON), lower = Math.min(cur.close, cur.open) - cur.low, upper = cur.high - Math.max(cur.close, cur.open);
  if (cur.close > cur.open && prev.close < prev.open && cur.close >= prev.open && cur.open <= prev.close) return { name: 'Engolfo de alta', bullish: true };
  if (cur.close > cur.open && lower >= body * 2 && body / range < .42) return { name: 'Martelo comprador', bullish: true };
  if (cur.close > prev.high && cur.close > cur.open) return { name: 'Rompimento de máxima', bullish: true };
  if (cur.close < cur.open && prev.close > prev.open && cur.open >= prev.close && cur.close <= prev.open) return { name: 'Engolfo de baixa', bullish: false, side: 'VENDA' };
  if (cur.close < cur.open && upper >= body * 2 && body / range < .42) return { name: 'Estrela cadente', bullish: false, side: 'VENDA' };
  return { name: 'Sem padrão de compra forte', bullish: false };
}
function bullishPivot(candles) {
  const sample = candles.slice(-42), lows = [], highs = [];
  for (let i = 2; i < sample.length - 2; i++) { const group = sample.slice(i - 2, i + 3); if (sample[i].low === Math.min(...group.map(c => c.low))) lows.push(sample[i]); if (sample[i].high === Math.max(...group.map(c => c.high))) highs.push(sample[i]); }
  const [olderLow, latestLow] = lows.slice(-2), latestHigh = highs.at(-1), close = sample.at(-1).close;
  return { bullish: Boolean(olderLow && latestLow && latestHigh && latestLow.low > olderLow.low && close > latestHigh.high), label: olderLow && latestLow && latestHigh ? 'Pivô de alta' : 'Estrutura indefinida' };
}
function supportResistance(candles, price) {
  const sample = candles.slice(-55), supports = [], resistances = [];
  for (let i = 2; i < sample.length - 2; i++) { const c = sample[i], nearby = sample.slice(i - 2, i + 3); if (c.low === Math.min(...nearby.map(x => x.low))) supports.push(c.low); if (c.high === Math.max(...nearby.map(x => x.high))) resistances.push(c.high); }
  return { support: supports.filter(x => x < price).sort((a, b) => b - a)[0] || Math.min(...sample.map(x => x.low)), resistance: resistances.filter(x => x > price).sort((a, b) => a - b)[0] || null };
}
function weeklyExtension(candles) {
  const weekly = analyseTimeframe(candles), close = weekly.close, low12 = Math.min(...candles.slice(-13, -1).map(c => c.low)), low26 = Math.min(...candles.slice(-27, -1).map(c => c.low));
  const rise12 = (close / low12 - 1) * 100, rise26 = (close / low26 - 1) * 100, distanceAtr = (close - weekly.ema22) / Math.max(weekly.atr, Number.EPSILON);
  const high52 = Math.max(...candles.slice(-53).map(c => c.high)), nearHigh = (high52 - close) / high52 * 100 <= 4;
  const blocked = (weekly.rsi >= 70 && (rise12 >= 60 || distanceAtr >= 3.5)) || (nearHigh && weekly.rsi >= 65 && rise12 >= 80);
  return { weekly, rise12, rise26, distanceAtr, nearHigh, blocked };
}
function analyseTimeframe(candles) {
  const closes = candles.map(c => c.close), volumes = candles.map(c => c.volume), sellVolumes = candles.map(c => c.takerBuyVolume == null ? (c.close < c.open ? c.volume : c.volume * .4) : c.volume - c.takerBuyVolume), e9 = ema(closes, 9), e22 = ema(closes, 22), e51 = ema(closes, 51), e80 = ema(closes, 80), rs = rsi(closes), mc = macd(closes), volumeAvg = sma(volumes, 20), sellAvg = sma(sellVolumes, 20), dx = adx(candles), stoch = stochRsi(closes);
  const i = closes.length - 1, aligned = closes[i] > e9[i] && e9[i] > e22[i] && e22[i] > e51[i] && e51[i] > e80[i], rising = e22[i] > e22[i - 3], momentum = rs[i] >= 50 && rs[i] <= 72 && mc.histogram[i] > 0, relativeVolume = volumes[i] / Math.max(volumeAvg[i] || volumes[i], .00001), strong = (dx[i] || 0) >= 18, stochCrossUp = stoch.k[i] > stoch.d[i] && (stoch.k[i - 1] <= stoch.d[i - 1] || stoch.k[i - 2] <= stoch.d[i - 2]) && Math.min(stoch.k[i - 1], stoch.d[i - 1], stoch.k[i - 2], stoch.d[i - 2]) < 25, stochRecovery = stoch.k[i] > stoch.d[i] && stoch.k[i] <= 50 && Math.min(stoch.k[i - 1], stoch.k[i - 2]) < 25, sellerDrying = sellVolumes[i] <= (sellAvg[i] || sellVolumes[i]) * .9, buyerDominance = candles[i].takerBuyVolume == null ? candles[i].close > candles[i].open && relativeVolume >= 1.05 : candles[i].takerBuyVolume / Math.max(volumes[i], Number.EPSILON) >= .51;
  return { aligned, rising, momentum, relativeVolume, strong, rsi: rs[i], adx: dx[i] || 0, atr: last(atr(candles)), ema9: e9[i], ema22: e22[i], ema51: e51[i], ema80: e80[i], macdLine: mc.line[i], macdHistogram: mc.histogram[i], stochK: stoch.k[i], stochD: stoch.d[i], stochCrossUp, stochRecovery, sellerDrying, buyerDominance, lastLow: candles[i].low, recentLow: Math.min(...candles.slice(-10).map(c => c.low)), close: last(closes), pattern: candlePattern(candles), pivot: bullishPivot(candles), levels: supportResistance(candles, last(closes)) };
}
function lateEntry(timing, triggerCandles, triggerTimeframe = '1h') {
  // Filtro anti-perseguição: não entrar depois de uma arrancada já esticada.
  // A mesma regra é usada no backtest para que a comparação seja honesta.
  const maxExtension = triggerTimeframe === '1h' ? 2.5 : triggerTimeframe === '2h' ? 3 : 4;
  const maxRecentRise = triggerTimeframe === '1h' ? 6 : 8;
  const emaDistance = timing.ema9 ? (timing.close / timing.ema9 - 1) * 100 : 0;
  const baseCandles = triggerCandles.slice(-8, -1), base = baseCandles.length ? Math.min(...baseCandles.map(candle => candle.low)) : timing.close;
  const recentRise = base ? (timing.close / base - 1) * 100 : 0;
  const pullbackMissing = timing.recentLow > timing.ema9 * 1.035 && timing.recentLow > timing.ema22 * 1.035;
  return emaDistance > maxExtension || recentRise > maxRecentRise || timing.rsi >= 68 || pullbackMissing;
}
function pullbackStochCriteria(extension, day, two, one) {
  const macro = extension.weekly.close >= extension.weekly.ema22 && !extension.blocked && day.close >= day.ema51 && day.rsi >= 48 && day.macdHistogram >= 0;
  const dailyPullback = day.recentLow <= day.ema9 * 1.025 && day.close >= day.ema22 && (day.stochCrossUp || day.stochRecovery);
  const timing2h = two.close >= two.ema51 && (two.pivot.bullish || two.pattern.bullish) && (two.sellerDrying || two.buyerDominance || two.relativeVolume >= .9);
  return { valid: macro && dailyPullback && timing2h && one.close >= one.ema51 && one.rsi >= 46, dailyPullback, timing2h };
}
function aggressivePullbackCriteria(extension, day, four, two, one) {
  const macro = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && day.close >= day.ema51 && day.rsi >= 45 && day.macdHistogram >= 0 && four.aligned && four.rising;
  const pullback1h = one.close >= one.ema51 && (one.recentLow <= one.ema9 * 1.02 || one.recentLow <= one.ema22 * 1.02) && (one.pivot.bullish || one.pattern.bullish);
  const confirmation = two.close >= two.ema51 && (two.pivot.bullish || two.pattern.bullish || two.momentum) && (one.buyerDominance || one.relativeVolume >= .9);
  return { valid: macro && pullback1h && confirmation, pullback1h, confirmation };
}
function pullback1hConfirmationCriteria(extension, day, confirmation, one) {
  const macro = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && day.close >= day.ema51 && day.rsi >= 45 && day.macdHistogram >= 0;
  const pullback1h = one.close >= one.ema51 && (one.recentLow <= one.ema9 * 1.02 || one.recentLow <= one.ema22 * 1.02) && (one.pivot.bullish || one.pattern.bullish);
  const confirmed = confirmation.close >= confirmation.ema51 && confirmation.aligned && confirmation.rising && (confirmation.pivot.bullish || confirmation.pattern.bullish || confirmation.momentum);
  return { valid: macro && pullback1h && confirmed, pullback1h, confirmed };
}
const VERSION = '2026-10-01-dual-live-sources-binance-okx-kucoin-v1';
const SOURCES = Object.freeze({ spot: 'https://data-api.binance.vision/api/v3', futures: 'https://fapi.binance.com/fapi/v1', ranking: 'https://api.coingecko.com/api/v3', cmc: 'https://pro-api.coinmarketcap.com/public-api/v3', okx: 'https://www.okx.com/api/v5', kucoin: 'https://api.kucoin.com' });
const DEFAULTS = Object.freeze({ minScore: 90, minVolume: 1000000, assetLimit: 1000, strategy: 'both', maxSignals: 10 });
const INTERVALS = ['1w', '1d', '4h', '2h', '1h'];
const STRATEGIES = Object.freeze({ trend: 'Tendência + pivô', 'aggressive-pullback': 'Pullback 2H + confirmação 4H' });
function settings(input = {}) {
  const result = { ...DEFAULTS, ...input };
  if (![90, 100].includes(Number(result.minScore))) throw new Error('Score mínimo deve ser 90 ou 100.');
  if (![1000000, 2000000, 5000000].includes(Number(result.minVolume))) throw new Error('Volume mínimo inválido.');
  if (!Number.isInteger(Number(result.assetLimit)) || result.assetLimit < 1 || result.assetLimit > 1500) throw new Error('Limite de ativos inválido.');
  if (!['both', ...Object.keys(STRATEGIES)].includes(result.strategy)) throw new Error('Setup ao vivo inválido.');
  return { ...result, minScore: Number(result.minScore), minVolume: Number(result.minVolume), assetLimit: Number(result.assetLimit), maxSignals: 10 };
}
function closedCandles(raw, asOf = Date.now()) {
  if (!Array.isArray(raw)) throw new Error('Resposta de candles inválida.');
  return raw.filter(row => Number.isFinite(Number(row[6])) && Number(row[6]) < asOf).map(row => ({ time: Number(row[0]), closeTime: Number(row[6]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]), takerBuyVolume: row[9] == null ? null : Number(row[9]) })).filter(c => [c.time,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite) && c.close > 0 && c.volume >= 0 && c.high >= Math.max(c.open,c.close) && c.low <= Math.min(c.open,c.close)).sort((a,b) => a.time-b.time);
}
function confirmedMacro(analyses) {
  return [analyses.day, analyses.four, analyses.two].every(t => t.aligned && t.rising) && analyses.one.aligned && analyses.one.momentum;
}
function analyseSet(series) {
  if (!series || INTERVALS.some(interval => !Array.isArray(series[interval]) || series[interval].length < (interval === '1w' ? 51 : 80))) return null;
  const [weekly, day, four, two, one] = INTERVALS.map(interval => analyseTimeframe(series[interval]));
  if ([weekly,day,four,two,one].some(t => !t || ![t.close,t.ema22,t.ema51,t.rsi,t.atr].every(Number.isFinite))) return null;
  return { weekly, day, four, two, one, extension: weeklyExtension(series['1w']) };
}
function evaluateAnalyses(asset, series, analyses, strategy, options = DEFAULTS, triggerTimeframe = '2h') {
  const config = settings(options);
  if (!analyses || !Object.hasOwn(STRATEGIES,strategy) || !['1h','2h','4h','1d'].includes(triggerTimeframe)) return null;
  const { extension, day:d, four, two, one } = analyses;
  const timing = { '1h':one,'2h':two,'4h':four,'1d':d }[triggerTimeframe], triggerSeries = series[triggerTimeframe];
  const triggerBullish = timing.pattern.bullish || timing.pivot.bullish;
  if (!triggerSeries?.length || !triggerBullish || !confirmedMacro(analyses)) return null;
  const trendValid = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && d.close >= d.ema51 && d.rsi >= 48 && four.close >= four.ema51 && two.close >= two.ema51 && timing.close >= timing.ema51 && timing.rsi >= 46 && (timing.pivot.bullish || timing.pattern.bullish) && timing.relativeVolume >= .9;
  const pullback = aggressivePullbackCriteria(extension,d,four,two,one);
  if (!(strategy === 'trend' ? trendValid : pullback.valid) || lateEntry(timing,triggerSeries,triggerTimeframe)) return null;
  let score = strategy === 'trend' ? 58 : 60;
  if (d.momentum) score += 8;
  if (four.momentum) score += 10;
  if (two.momentum) score += 8;
  if (timing.pattern.bullish) score += 7;
  if (timing.pivot.bullish && two.pivot.bullish) score += 8;
  if (timing.relativeVolume >= 1.25) score += 9;
  if (two.strong || timing.strong) score += 7;
  if (strategy === 'aggressive-pullback' && timing.pivot.bullish) score += 8;
  score = Math.min(score,100);
  if (score < config.minScore) return null;
  const entry = timing.close, previousLow = Math.min(...triggerSeries.slice(-4,-1).map(c => c.low)), stop = previousLow - timing.atr * .12, risk = entry-stop, tp2 = entry+2*risk, tp3 = entry+3*risk;
  if (![entry,stop,risk,tp2,tp3].every(Number.isFinite) || risk <= 0 || risk/entry > .08 || (tp2-entry)/entry < .03 || (timing.levels.resistance && timing.levels.resistance-entry < 2*risk)) return null;
  return { ...asset, source:asset.source||'BINANCE', direction:'LONG', strategy, strategyName:STRATEGIES[strategy], setup:STRATEGIES[strategy], triggerTimeframe, triggerLabel:triggerTimeframe.toUpperCase(), timeframe:triggerTimeframe.toUpperCase(), score, entry, stop, tp2, tp3, target:tp2, candleTime:triggerSeries.at(-1).time, rsi:timing.rsi, adx:timing.adx, volumeRatio:timing.relativeVolume, context:'Macro LONG confirmado: 1W · 1D · 4H · 2H · 1H', trigger:`${timing.pattern.bullish ? timing.pattern.name : timing.pivot.label} · RSI ${timing.rsi.toFixed(1)} · volume ${timing.relativeVolume.toFixed(2)}x`, support:timing.levels.support, resistance:timing.levels.resistance, weeklyRise:extension.rise12, weeklyRsi:extension.weekly.rsi, lateEntryAllowed:false, engineVersion:VERSION };
}
function evaluate(asset, series, options = DEFAULTS) {
  const config = settings(options), analyses = analyseSet(series);
  const volume=Number(asset.volume ?? asset.volume24h);
  if (!Number.isFinite(volume) || volume < config.minVolume) return null;
  const strategies = config.strategy === 'both' ? Object.keys(STRATEGIES) : [config.strategy];
  return strategies.map(strategy=>evaluateAnalyses(asset,series,analyses,strategy,config)).filter(Boolean).sort(compareSignals)[0] || null;
}
function compareSignals(a,b) { return b.score-a.score || (a.strategy === b.strategy ? 0 : a.strategy === 'trend' ? -1 : 1) || (a.rank||99999)-(b.rank||99999) || a.symbol.localeCompare(b.symbol); }
function consolidate(signals, limit = 10) { const seen=new Set(); return signals.slice().sort(compareSignals).filter(s=>{if(seen.has(s.symbol))return false; seen.add(s.symbol); return true;}).slice(0,limit); }
function isFresh(signal, previous, now = Date.now()) {
  if (!previous) return true;
  // A previously processed closed candle never becomes new merely through elapsed time.
  if (previous.candleTime && Number(previous.candleTime) === Number(signal.candleTime)) return false;
  return now-Number(previous.at) > 12*3600000 || Math.abs(signal.entry-previous.entry)/Math.max(signal.entry,1e-12) >= .015;
}
function rankingLabel(asset) {
  const labels=['CoinGecko','CoinMarketCap'].filter(source=>Number.isInteger(asset.rankings?.[source])).map(source=>`${source} #${asset.rankings[source]}`);
  return labels.length ? labels.join(' · ') : 'Ranking por volume Binance; capitalização não confirmada';
}
async function marketUniverse(getJson, options = DEFAULTS) {
  const config=settings(options);
  const [exchange,tickers] = await Promise.all([getJson(`${SOURCES.spot}/exchangeInfo`),getJson(`${SOURCES.spot}/ticker/24hr`)]);
  if (!Array.isArray(exchange.symbols) || !Array.isArray(tickers)) throw new Error('Universo Binance inválido.');
  const pairs=new Set(exchange.symbols.filter(s=>s.status==='TRADING' && s.quoteAsset==='USDT' && s.isSpotTradingAllowed).map(s=>s.symbol));
  const volumes=new Map(tickers.map(t=>[t.symbol,Number(t.quoteVolume)||0]));
  const warnings=[], rankings={};
  const okxPairs=new Map(), okxVolumes=new Map(), kucoinPairs=new Map(), kucoinVolumes=new Map();
  const okxJob=Promise.all([getJson(`${SOURCES.okx}/public/instruments?instType=SPOT`),getJson(`${SOURCES.okx}/market/tickers?instType=SPOT`)]).then(([instruments,quotes])=>{
    if(String(instruments.code)!=='0'||String(quotes.code)!=='0'||!Array.isArray(instruments.data)||!Array.isArray(quotes.data))throw new Error('Universo OKX inválido');
    for(const p of instruments.data)if(p.state==='live'&&p.quoteCcy==='USDT')okxPairs.set(`${p.baseCcy}USDT`,p.instId);
    for(const q of quotes.data)okxVolumes.set(q.instId,Number(q.volCcy24h)||0);
  }).catch(error=>warnings.push(`OKX: ${error.message}`));
  const kucoinJob=Promise.all([getJson(`${SOURCES.kucoin}/api/v1/symbols`),getJson(`${SOURCES.kucoin}/api/v1/market/allTickers`)]).then(([symbols,tickers])=>{if(String(symbols.code)!=='200000'||String(tickers.code)!=='200000'||!Array.isArray(symbols.data)||!Array.isArray(tickers.data?.ticker))throw new Error('Universo KuCoin inválido');for(const p of symbols.data)if(p.enable&&p.quoteCurrency==='USDT')kucoinPairs.set(`${p.baseCurrency}USDT`,p.symbol);for(const q of tickers.data.ticker)kucoinVolumes.set(q.symbol,Number(q.volValue)||0);}).catch(error=>warnings.push(`KuCoin: ${error.message}`));
  const jobs=[['CoinGecko',async()=>{const rows=[];for(let page=1;page<=Math.ceil(config.assetLimit/250);page++){const coins=await getJson(`${SOURCES.ranking}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`);if(!Array.isArray(coins)||!coins.length)throw new Error('Ranking indisponível');rows.push(...coins);}return rows.map(c=>({...c,rank:Number(c.market_cap_rank)}));}],['CoinMarketCap',async()=>{const result=await getJson(`${SOURCES.cmc}/cryptocurrency/listings/latest?start=1&limit=${config.assetLimit}&convert=USD&sort=market_cap&sort_dir=desc`);if(!Array.isArray(result.data)||(result.status?.error_code != null && Number(result.status.error_code)!==0))throw new Error(result.status?.error_message||'Ranking inválido');return result.data.map(c=>({...c,rank:Number(c.cmc_rank)}));}]];
  const settled=await Promise.allSettled(jobs.map(([,load])=>load()));
  await Promise.all([okxJob,kucoinJob]);
  const merged=new Map();
  settled.forEach((result,index)=>{
    const source=jobs[index][0];
    if(result.status==='rejected'){warnings.push(`${source}: ${result.reason.message}`);return;}
    const rows=result.value.filter(c=>Number.isInteger(c.rank)&&c.rank>=1&&c.rank<=config.assetLimit&&/^[a-z0-9]+$/i.test(c.symbol||''));
    if(!rows.length){warnings.push(`${source}: ranking sem ativos válidos`);return;}
    rankings[source]=rows.length;
    const symbols=new Map();for(const c of rows){const symbol=String(c.symbol).toUpperCase();symbols.set(symbol,(symbols.get(symbol)||0)+1);}
    for(const c of rows){const symbol=`${String(c.symbol).toUpperCase()}USDT`;if(symbols.get(String(c.symbol).toUpperCase())>1){if(pairs.has(symbol)||okxPairs.has(symbol))warnings.push(`${source}: símbolo ambíguo ${symbol}, ignorado nessa fonte`);continue;}const old=merged.get(symbol)||{symbol,name:c.name,rank:c.rank,rankingSources:[],rankings:{}};old.rank=Math.min(old.rank,c.rank);old.rankingSources.push(source);old.rankings[source]=c.rank;merged.set(symbol,old);}
  });
  const sources=Object.keys(rankings);
  if(!sources.length)throw new Error(`Nenhum ranking por capitalização disponível; scanner interrompido. ${warnings.join(' | ')}`);
  const mode=`market cap (${sources.join(' + ')})`, candidates=[...merged.values()];
  const seen=new Set();
  const assets=candidates.filter(c=>(pairs.has(c.symbol)||okxPairs.has(c.symbol)||kucoinPairs.has(c.symbol)) && !['BTCUSDT','ETHUSDT'].includes(c.symbol) && !seen.has(c.symbol) && (seen.add(c.symbol),true)).map(c=>{const binance=pairs.has(c.symbol),okx=okxPairs.has(c.symbol),exchangeSymbol=binance?c.symbol:(okx?okxPairs.get(c.symbol):kucoinPairs.get(c.symbol)),source=binance?'BINANCE':(okx?'OKX':'KUCOIN'),volume=binance?(volumes.get(c.symbol)||0):(okx?(okxVolumes.get(exchangeSymbol)||0):(kucoinVolumes.get(exchangeSymbol)||0));return {...c,source,exchangeSymbol,volume,volume24h:volume};}).filter(a=>a.volume >= config.minVolume).sort((a,b)=>a.rank-b.rank||a.symbol.localeCompare(b.symbol));
  return {assets,mode,warnings,rankings};
}
async function fetchSeries(getJson,symbol,asOf,source=SOURCES.spot) {
  if(source===SOURCES.okx){
    const bars={'1w':'1Wutc','1d':'1Dutc','4h':'4H','2h':'2H','1h':'1H'},instId=symbol.endsWith('-USDT')?symbol:symbol.replace(/USDT$/,'-USDT');
    const values=await Promise.all(INTERVALS.map(async interval=>{const result=await getJson(`${SOURCES.okx}/market/history-candles?instId=${encodeURIComponent(instId)}&bar=${bars[interval]}&limit=210&after=${asOf}`);if(String(result.code)!=='0'||!Array.isArray(result.data))throw new Error(result.msg||'Candles OKX inválidos');return closedOkxCandles(result.data,interval,asOf);}));
    return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
  }
  const kucoinIntervals={'1w':'1week','1d':'1day','4h':'4hour','2h':'2hour','1h':'1hour'};
  if(source===SOURCES.kucoin){const instId=symbol.includes('-')?symbol:symbol.replace(/USDT$/,'-USDT');const values=await Promise.all(INTERVALS.map(async interval=>{const duration={'1w':604800,'1d':86400,'4h':14400,'2h':7200,'1h':3600}[interval],end=Math.floor(asOf/1000),start=end-210*duration,result=await getJson(`${SOURCES.kucoin}/api/v1/market/candles?symbol=${encodeURIComponent(instId)}&type=${kucoinIntervals[interval]}&startAt=${start}&endAt=${end}`);if(String(result.code)!=='200000'||!Array.isArray(result.data))throw new Error(result.msg||'Candles KuCoin inválidos');const rows=result.data.map(r=>[Number(r[0])*1000,r[1],r[3],r[4],r[2],r[5],Number(r[0])*1000+duration*1000-1]);return closedCandles(rows,asOf);}));return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));}
  const values=await Promise.all(INTERVALS.map(interval=>getJson(`${source}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=210&endTime=${asOf-1}`).then(raw=>closedCandles(raw,asOf))));
  return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
}
function closedOkxCandles(raw,interval,asOf=Date.now()) {
  const duration={'1w':7*86400000,'1d':86400000,'4h':4*3600000,'2h':2*3600000,'1h':3600000}[interval];
  if(!duration||!Array.isArray(raw))throw new Error('Candles OKX inválidos');
  // OKX returns newest first and does not expose taker-buy volume in this endpoint.
  return closedCandles(raw.filter(row=>String(row[8])==='1').map(row=>[row[0],row[1],row[2],row[3],row[4],row[5],Number(row[0])+duration-1]),asOf);
}
async function vehicle(getJson,signal,asOf) {
  const spot={...signal,vehicle:'SPOT',leverage:'1×',vehicleReason:`Setup SPOT confirmado na ${signal.source||'BINANCE'}.`};
  if(signal.source==='OKX')return spot;
  try {
    const [series,premium]=await Promise.all([fetchSeries(getJson,signal.symbol,asOf,SOURCES.futures),getJson(`${SOURCES.futures}/premiumIndex?symbol=${signal.symbol}`)]);
    const analyses=analyseSet(series), funding=Number(premium.lastFundingRate);
    if(!analyses || analyses.extension.blocked || analyses.weekly.close < analyses.weekly.ema22 || !confirmedMacro(analyses)) return {...spot,vehicleReason:'Setup SPOT confirmado; futuros sem confirmação suficiente.'};
    const atrPct=analyses.one.atr/analyses.one.close*100;
    if(signal.score>=90 && analyses.one.relativeVolume>=1.25 && atrPct<=3.5 && Number.isFinite(funding) && funding<=.0003) return {...signal,vehicle:'FUTURES',leverage:'3× máx.',funding,atrPct,vehicleReason:`Futuros confirmados; ATR ${atrPct.toFixed(1)}% e funding ${(funding*100).toFixed(3)}%.`};
    return {...spot,vehicleReason:'Setup SPOT confirmado; volatilidade, volume ou funding não qualificam futuros.'};
  }catch(error){return {...spot,vehicleReason:'Setup SPOT confirmado; consulta de futuros indisponível.',vehicleWarning:error.message};}
}
async function scanMarket(getJson,options=DEFAULTS,onProgress=()=>{}) {
  const config=settings(options), clock=await getJson(`${SOURCES.spot}/time`), asOf=Number(clock.serverTime);
  if(!Number.isFinite(asOf))throw new Error('Horário Binance inválido.');
  const universe=await marketUniverse(getJson,config), signals=[], failures=[], warnings=[...universe.warnings];let next=0,done=0;
  async function worker(){while(next<universe.assets.length){const asset=universe.assets[next++];try{const series=await fetchSeries(getJson,asset.exchangeSymbol||asset.symbol,asOf,asset.source==='OKX'?SOURCES.okx:(asset.source==='KUCOIN'?SOURCES.kucoin:SOURCES.spot)), signal=evaluate(asset,series,config);if(signal)signals.push(signal);}catch(error){failures.push({symbol:asset.symbol,source:asset.source,error:error.message});}onProgress(++done,universe.assets.length);}}
  await Promise.all(Array.from({length:Math.min(4,universe.assets.length)},worker));
  if(universe.assets.length && failures.length===universe.assets.length)throw new Error(`Todas as ${failures.length} consultas de ativos falharam: ${failures[0].error}`);
  const qualified=consolidate(signals), selected=[];
  for(const signal of qualified){const checked=await vehicle(getJson,signal,asOf);selected.push(checked);if(checked.vehicleWarning)warnings.push(`${signal.symbol}: ${checked.vehicleWarning}`);}
  return {signals:selected,assets:universe.assets.length,mode:universe.mode,failures,warnings,asOf,config,engineVersion:VERSION};
}

return Object.freeze({last,sma,ema,rsi,atr,macd,adx,stochRsi,candlePattern,bullishPivot,supportResistance,weeklyExtension,analyseTimeframe,lateEntry,pullbackStochCriteria,aggressivePullbackCriteria,pullback1hConfirmationCriteria,VERSION,SOURCES,DEFAULTS,STRATEGIES,settings,closedCandles,closedOkxCandles,confirmedMacro,analyseSet,evaluateAnalyses,evaluate,compareSignals,consolidate,isFresh,rankingLabel,marketUniverse,fetchSeries,vehicle,scanMarket});
});
