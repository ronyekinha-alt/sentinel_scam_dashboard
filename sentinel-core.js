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
  const closes = candles.map(c => c.close), volumes = candles.map(c => c.volume), sellVolumes = candles.map(c => c.takerBuyVolume == null ? (c.close < c.open ? c.volume : c.volume * .4) : c.volume - c.takerBuyVolume), e8 = ema(closes, 8), e9 = ema(closes, 9), e22 = ema(closes, 22), e51 = ema(closes, 51), e80 = ema(closes, 80), rs = rsi(closes), mc = macd(closes), volumeAvg = sma(volumes, 20), sellAvg = sma(sellVolumes, 20), dx = adx(candles), stoch = stochRsi(closes);
  const i = closes.length - 1, aligned = closes[i] > e9[i] && e9[i] > e22[i] && e22[i] > e51[i] && e51[i] > e80[i], rising = e22[i] > e22[i - 3], momentum = rs[i] >= 50 && rs[i] <= 72 && mc.histogram[i] > 0, relativeVolume = volumes[i] / Math.max(volumeAvg[i] || volumes[i], .00001), strong = (dx[i] || 0) >= 18, stochCrossUp = stoch.k[i] > stoch.d[i] && (stoch.k[i - 1] <= stoch.d[i - 1] || stoch.k[i - 2] <= stoch.d[i - 2]) && Math.min(stoch.k[i - 1], stoch.d[i - 1], stoch.k[i - 2], stoch.d[i - 2]) < 25, stochRecovery = stoch.k[i] > stoch.d[i] && stoch.k[i] <= 50 && Math.min(stoch.k[i - 1], stoch.k[i - 2]) < 25, sellerDrying = sellVolumes[i] <= (sellAvg[i] || sellVolumes[i]) * .9, buyerDominance = candles[i].takerBuyVolume == null ? candles[i].close > candles[i].open && relativeVolume >= 1.05 : candles[i].takerBuyVolume / Math.max(volumes[i], Number.EPSILON) >= .51;
  return { aligned, rising, momentum, relativeVolume, strong, rsi: rs[i], adx: dx[i] || 0, atr: last(atr(candles)), ema8: e8[i], ema9: e9[i], ema22: e22[i], ema51: e51[i], ema80: e80[i], macdLine: mc.line[i], macdHistogram: mc.histogram[i], stochK: stoch.k[i], stochD: stoch.d[i], stochCrossUp, stochRecovery, sellerDrying, buyerDominance, lastLow: candles[i].low, recentLow: Math.min(...candles.slice(-10).map(c => c.low)), close: last(closes), pattern: candlePattern(candles), pivot: bullishPivot(candles), levels: supportResistance(candles, last(closes)) };
}
function lateEntry(timing, triggerCandles, triggerTimeframe = '1h') {
  // Filtro anti-perseguição: não entrar depois de uma arrancada já esticada.
  // A mesma regra é usada no backtest para que a comparação seja honesta.
  const maxExtension = 11;
  const maxRecentRise = 11;
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
const VERSION = '2026-10-09-restored-2026-10-05-setups-live-safety-v1';
const SOURCES = Object.freeze({ spot: 'https://data-api.binance.vision/api/v3', futures: 'https://fapi.binance.com/fapi/v1', mexc: 'https://api.mexc.com/api/v3', ranking: 'https://api.coingecko.com/api/v3', cmc: 'https://pro-api.coinmarketcap.com/public-api/v3', paprika: 'https://api.coinpaprika.com/v1' });
const DEFAULTS = Object.freeze({ minScore: 90, minVolume: 1000000, assetLimit: 1000, strategy: 'both', maxSignals: 20, enforceRiskPolicy: false, maxEntryDeviationPct: 2 });
const INTERVALS = ['1w', '1d', '4h', '2h', '1h'];
const STABLE_BASES = new Set(['USDT','USDC','USDE','USD1','DAI','FDUSD','TUSD','USDD','BUSD','PYUSD','USDP','FRAX','GUSD','EURC','EURS','USDY']);
function isStableAsset(symbol) { return STABLE_BASES.has(String(symbol||'').replace(/USDT$/,'').toUpperCase()); }
const STRATEGIES = Object.freeze({ trend: 'Tendência + pivô', 'aggressive-pullback': 'Pullback 2H + confirmação 4H', 'flexible-pullback-2h': 'Pullback 2H · diário flexível', 'ema-cross-retest-2h': 'Cruzamento EMA 9 + reteste 22/52 · 2H' });
function settings(input = {}) {
  const result = { ...DEFAULTS, ...input };
  const selectedStrategies = Array.isArray(result.strategies) ? [...new Set(result.strategies)] : null;
  if (![0, 85, 90, 100].includes(Number(result.minScore))) throw new Error('Score mínimo deve ser 85, 90, 100 ou todos os scores.');
  if (![1000000, 2000000, 5000000].includes(Number(result.minVolume))) throw new Error('Volume mínimo inválido.');
  if (!Number.isInteger(Number(result.assetLimit)) || result.assetLimit < 1 || result.assetLimit > 1500) throw new Error('Limite de ativos inválido.');
  if (!['both', ...Object.keys(STRATEGIES)].includes(result.strategy)) throw new Error('Setup ao vivo inválido.');
  if (selectedStrategies && (!selectedStrategies.length || selectedStrategies.some(strategy => !Object.hasOwn(STRATEGIES, strategy)))) throw new Error('Selecione ao menos um setup válido.');
  if (!Number.isFinite(Number(result.maxEntryDeviationPct)) || Number(result.maxEntryDeviationPct) < 0 || Number(result.maxEntryDeviationPct) > 5) throw new Error('Distância máxima da entrada inválida.');
  return { ...result, strategies: selectedStrategies, minScore: Number(result.minScore), minVolume: Number(result.minVolume), assetLimit: Number(result.assetLimit), maxSignals: 20, enforceRiskPolicy: Boolean(result.enforceRiskPolicy), maxEntryDeviationPct: Number(result.maxEntryDeviationPct) };
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
function emaCrossRetest2hCriteria(series, analyses) {
  const candles = series['2h'], timing = analyses.two, { day, four, extension } = analyses;
  if (!Array.isArray(candles) || candles.length < 80) return { valid:false, reason:'Candles 2H insuficientes para cruzamento EMA' };
  const closes = candles.map(candle => candle.close), e9 = ema(closes,9), e22 = ema(closes,22), e52 = ema(closes,51), i = closes.length - 1;
  const crossedRecently = Array.from({length:Math.min(10,i-1)},(_,offset)=>i-offset).some(index=>e9[index]>e22[index]&&e9[index]>e52[index]&&(e9[index-1]<=e22[index-1]||e9[index-1]<=e52[index-1]));
  const retest = candles.slice(-8,-1).some((candle,offset)=>{const index=i-7+offset;return candle.low<=e22[index]*1.018||candle.low<=e52[index]*1.025;});
  const previousHigh = Math.max(...candles.slice(-7,-1).map(candle=>candle.high));
  const closedBreakout = timing.close>previousHigh && candles.at(-1).close>candles.at(-1).open;
  const structure = timing.close>timing.ema9&&timing.ema9>timing.ema22&&timing.ema22>timing.ema51;
  const fourEma22=ema(series['4h'].map(candle=>candle.close),22), macro=!extension.blocked&&extension.weekly.close>=extension.weekly.ema22&&day.close>=day.ema80&&day.rsi>=42&&four.close>=four.ema51&&fourEma22.at(-1)>=fourEma22.at(-3)&&four.rsi>=45;
  const recentRise=(timing.close/candles.at(-7).close-1)*100;
  const valid=crossedRecently&&retest&&closedBreakout&&structure&&macro&&timing.relativeVolume>=1&&timing.rsi>=50&&timing.rsi<=72&&recentRise<=11;
  return {valid,crossedRecently,retest,closedBreakout,structure,macro,recentRise,previousHigh};
}
function evaluateAnalyses(asset, series, analyses, strategy, options = DEFAULTS, triggerTimeframe = '2h') {
  const config = settings(options);
  const diagnostic = arguments[6];
  const reject = reason => { if (diagnostic && !diagnostic.reason) diagnostic.reason = reason; return null; };
  if (!analyses || !Object.hasOwn(STRATEGIES,strategy) || !['1h','2h','4h','1d'].includes(triggerTimeframe)) return reject('Dados de candles insuficientes ou configuração inválida');
  const { extension, day:d, four, two, one } = analyses;
  const timing = { '1h':one,'2h':two,'4h':four,'1d':d }[triggerTimeframe], triggerSeries = series[triggerTimeframe], emaCross = strategy==='ema-cross-retest-2h' ? emaCrossRetest2hCriteria(series,analyses) : null;
  const triggerBullish = timing.pattern.bullish || timing.pivot.bullish;
  if (!triggerSeries?.length) return reject('Sem candles fechados no tempo do gatilho');
  if (!triggerBullish && !emaCross?.closedBreakout) return reject('Sem padrão comprador, pivô ou rompimento fechado no gatilho');
  const flexibleMacro = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && d.close >= d.ema80 && d.rsi >= 40 && four.aligned && four.rising && two.close >= two.ema51 && one.aligned && one.momentum;
  if (strategy==='ema-cross-retest-2h' ? (triggerTimeframe!=='2h'||!emaCross.valid) : strategy === 'flexible-pullback-2h' ? (!flexibleMacro || triggerTimeframe !== '2h') : !confirmedMacro(analyses)) return reject(strategy==='ema-cross-retest-2h' ? 'Cruzamento, reteste, rompimento ou macro 2H não confirmado' : 'Confirmação multi-tempo insuficiente');
  const trendValid = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && d.close >= d.ema51 && d.rsi >= 48 && four.close >= four.ema51 && two.close >= two.ema51 && timing.close >= timing.ema51 && timing.rsi >= 46 && (timing.pivot.bullish || timing.pattern.bullish) && timing.relativeVolume >= .9;
  const pullback = aggressivePullbackCriteria(extension,d,four,two,one);
  const flexiblePullback = flexibleMacro && one.close >= one.ema51 && (one.recentLow <= one.ema9 * 1.02 || one.recentLow <= one.ema22 * 1.02) && (one.pivot.bullish || one.pattern.bullish) && two.close >= two.ema51 && (two.pivot.bullish || two.pattern.bullish || two.momentum) && (one.buyerDominance || one.relativeVolume >= .9);
  if (!(strategy==='ema-cross-retest-2h'||(strategy === 'trend' ? trendValid : strategy === 'aggressive-pullback' ? pullback.valid : flexiblePullback))) return reject('Condições específicas do setup não confirmadas');
  if (strategy!=='ema-cross-retest-2h'&&lateEntry(timing,triggerSeries,triggerTimeframe)) return reject('Entrada esticada além do limite');
  let score = strategy==='ema-cross-retest-2h' ? 90 : strategy === 'trend' ? 58 : 60;
  if (d.momentum) score += strategy === 'flexible-pullback-2h' ? 4 : 8;
  if (four.momentum) score += 10;
  if (two.momentum) score += 8;
  if (timing.pattern.bullish) score += 7;
  if (timing.pivot.bullish && two.pivot.bullish) score += 8;
  if (timing.relativeVolume >= 1.25) score += 9;
  if (two.strong || timing.strong) score += 7;
  if ((strategy === 'aggressive-pullback' || strategy === 'flexible-pullback-2h') && timing.pivot.bullish) score += 8;
  score = Math.min(score,100);
  if (score < config.minScore) return reject(`Score ${score}, abaixo do mínimo ${config.minScore}`);
  const entry = timing.close, previousLow = Math.min(...triggerSeries.slice(-4,-1).map(c => c.low)), stop = previousLow - timing.atr * .12, risk = entry-stop, tp2 = entry+2*risk, tp3 = entry+3*risk;
  if (![entry,stop,risk,tp2,tp3].every(Number.isFinite) || risk <= 0) return reject('Risco ou níveis de entrada inválidos');
  const tickerPrice = Number(asset.price ?? asset.lastPrice);
  const latestPrice = Number.isFinite(tickerPrice) && tickerPrice > 0 ? tickerPrice : series?.['1h']?.at(-1)?.close ?? series?.['2h']?.at(-1)?.close ?? series?.['4h']?.at(-1)?.close;
  if (Number.isFinite(latestPrice) && latestPrice <= stop) return reject(`Sinal vencido: preço atual ${latestPrice.toFixed(8)} já rompeu o stop ${stop.toFixed(8)}`);
  if (Number.isFinite(latestPrice) && latestPrice >= tp2) return reject(`Sinal vencido: preço atual ${latestPrice.toFixed(8)} já atingiu o TP 2R ${tp2.toFixed(8)}`);
  if (Number.isFinite(latestPrice)) { const progress = (latestPrice-entry)/Math.max(tp2-entry,Number.EPSILON); if (progress >= .5) return reject(`Entrada esticada: preço atual já percorreu ${(progress*100).toFixed(0)}% do caminho até o TP 2R`); }
  if (Number.isFinite(latestPrice) && config.maxEntryDeviationPct > 0) { const deviation = Math.abs(latestPrice/entry-1)*100; if (deviation > config.maxEntryDeviationPct) return reject(`Entrada distante do preço atual (${deviation.toFixed(1)}% acima do limite de ${config.maxEntryDeviationPct.toFixed(1)}%)`); }
  const riskPct=Math.abs(risk/entry), highRisk=riskPct>.04;
  if (riskPct > .08) return reject(`Stop muito distante (${(riskPct*100).toFixed(1)}%)`);
  if ((tp2-entry)/entry < .03) return reject('Alvo 2R abaixo do mínimo de 3%');
  if (timing.levels.resistance && timing.levels.resistance-entry < 2*risk) return reject('Resistência não deixa espaço mínimo de 2R');
  const stretchPct = timing.ema9 ? (entry / timing.ema9 - 1) * 100 : 0, stretchWarning = stretchPct > 0 ? `Entrada esticada em ${stretchPct.toFixed(1)}% vs EMA9` : 'Entrada sem esticamento vs EMA9';
  const triggerLabel=strategy==='ema-cross-retest-2h'?'EMA 9 cruzou 22/52 · reteste confirmado · rompimento fechado':(timing.pattern.bullish ? timing.pattern.name : timing.pivot.label);
  return { ...asset, source:asset.source||'BINANCE', direction:'LONG', strategy, strategyName:STRATEGIES[strategy], setup:STRATEGIES[strategy], tier:score>=90?'VALIDATED':'WATCH', tierLabel:score>=90?'ENTRADA VALIDADA':'SETUP FORTE · AGUARDAR CONFIRMAÇÃO', triggerTimeframe, triggerLabel:triggerTimeframe.toUpperCase(), timeframe:triggerTimeframe.toUpperCase(), score, entry, stop, tp2, tp3, target:tp2, candleTime:triggerSeries.at(-1).time, rsi:timing.rsi, adx:timing.adx, volumeRatio:timing.relativeVolume, context:strategy==='ema-cross-retest-2h'?'Macro LONG: 1W · 1D · 4H, com cruzamento/reteste em 2H':'Macro LONG confirmado: 1W · 1D · 4H · 2H · 1H', trigger:`${triggerLabel} · RSI ${timing.rsi.toFixed(1)} · volume ${timing.relativeVolume.toFixed(2)}x · ${stretchWarning}`, entryStretchPct:stretchPct, entryWarning:highRisk?'Risco acima de 4%; somente SPOT, sem alavancagem':stretchWarning, support:timing.levels.support, resistance:timing.levels.resistance, weeklyRise:extension.rise12, weeklyRsi:extension.weekly.rsi, lateEntryAllowed:false, riskPct, maxLeverage:config.enforceRiskPolicy?(highRisk?1:2):3, riskTier:config.enforceRiskPolicy?(highRisk?'HIGH_RISK_SPOT':'STANDARD_LEVERAGE_2X'):null, engineVersion:VERSION };
}
function evaluate(asset, series, options = DEFAULTS, diagnostics = null) {
  const config = settings(options), analyses = analyseSet(series);
  const volume=Number(asset.volume ?? asset.volume24h);
  if (!Number.isFinite(volume) || volume < config.minVolume) { if (diagnostics) diagnostics.push({strategy:'geral',reason:`Volume do par abaixo de US$ ${config.minVolume.toLocaleString('en-US')}`}); return null; }
  const strategies = config.strategies || (config.strategy === 'both' ? Object.keys(STRATEGIES) : [config.strategy]);
  const attempts = strategies.flatMap(strategy => {
    const timeframes=strategy==='flexible-pullback-2h'||strategy==='ema-cross-retest-2h'?['2h']:['1h','2h','4h'];
    return timeframes.map(triggerTimeframe=>{const trace={strategy:`${strategy} · ${triggerTimeframe.toUpperCase()}`,reason:null};const signal=evaluateAnalyses(asset,series,analyses,strategy,config,triggerTimeframe,trace);if(diagnostics)diagnostics.push(trace);return signal;});
  });
  return attempts.filter(Boolean).sort(compareSignals)[0] || null;
}
function compareSignals(a,b) {
  const priority={trend:0,'aggressive-pullback':1,'flexible-pullback-2h':2,'ema-cross-retest-2h':3};
  return b.score-a.score || (priority[a.strategy]??99)-(priority[b.strategy]??99) || (a.rank||99999)-(b.rank||99999) || a.symbol.localeCompare(b.symbol);
}
function consolidate(signals, limit = 20) { const seen=new Set(); return signals.slice().sort(compareSignals).filter(s=>{if(seen.has(s.symbol))return false; seen.add(s.symbol); return true;}).slice(0,limit); }
function isFresh(signal, previous, now = Date.now()) {
  if (!previous) return true;
  // A previously processed closed candle never becomes new merely through elapsed time.
  if (previous.candleTime && Number(previous.candleTime) === Number(signal.candleTime)) return false;
  return now-Number(previous.at) > 12*3600000 || Math.abs(signal.entry-previous.entry)/Math.max(signal.entry,1e-12) >= .015;
}
function rankingLabel(asset) {
  if (asset?.tokenized) return 'Tokenizado MEXC · Spot';
  const labels=['CoinGecko','CoinMarketCap'].filter(source=>Number.isInteger(asset.rankings?.[source])).map(source=>`${source} #${asset.rankings[source]}`);
  return labels.length ? labels.join(' · ') : 'Ranking por volume Binance; capitalização não confirmada';
}
async function marketUniverse(getJson, options = DEFAULTS) {
  const config=settings(options);
  const [exchange,tickers] = await Promise.all([getJson(`${SOURCES.spot}/exchangeInfo`),getJson(`${SOURCES.spot}/ticker/24hr`)]);
  if (!Array.isArray(exchange.symbols) || !Array.isArray(tickers)) throw new Error('Universo Binance inválido.');
  const pairs=new Set(exchange.symbols.filter(s=>s.status==='TRADING' && s.quoteAsset==='USDT' && s.isSpotTradingAllowed).map(s=>s.symbol));
  const volumes=new Map(tickers.map(t=>[t.symbol,Number(t.quoteVolume)||0]));
  const prices=new Map(tickers.map(t=>[t.symbol,Number(t.lastPrice)||0]));
  const warnings=[], rankings={};
  const mexcPairs=new Map(), mexcMetadata=new Map(), mexcVolumes=new Map(), mexcPrices=new Map();
  const mexcJob=Promise.all([getJson(`${SOURCES.mexc}/exchangeInfo`),getJson(`${SOURCES.mexc}/ticker/24hr`)]).then(([info,quotes])=>{
    if(!Array.isArray(info.symbols)||!Array.isArray(quotes))throw new Error('Universo MEXC inválido');
    for(const p of info.symbols)if(p.status==='1'&&p.quoteAsset==='USDT'&&p.isSpotTradingAllowed!==false){mexcPairs.set(p.symbol,p.symbol);mexcMetadata.set(p.symbol,p);}
    for(const q of quotes){mexcVolumes.set(q.symbol,Number(q.quoteVolume)||0);mexcPrices.set(q.symbol,Number(q.lastPrice)||0);}
  }).catch(error=>warnings.push(`MEXC: ${error.message}`));
  const primaryJobs=[['CoinGecko',async()=>{const rows=[];for(let page=1;page<=Math.ceil(config.assetLimit/250);page++){const coins=await getJson(`${SOURCES.ranking}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`);if(!Array.isArray(coins)||!coins.length)throw new Error('Ranking indisponível');rows.push(...coins);}return rows.map(c=>({...c,rank:Number(c.market_cap_rank)}));}],['CoinMarketCap',async()=>{const result=await getJson(`${SOURCES.cmc}/cryptocurrency/listings/latest?start=1&limit=${config.assetLimit}&convert=USD&sort=market_cap&sort_dir=desc`);if(!Array.isArray(result.data)||(result.status?.error_code != null && Number(result.status.error_code)!==0))throw new Error(result.status?.error_message||'Ranking inválido');return result.data.map(c=>({...c,rank:Number(c.cmc_rank)}));}]];
  let jobs=primaryJobs, settled=await Promise.allSettled(primaryJobs.map(([,load])=>load()));
  if(!settled.some(result=>result.status==='fulfilled')){
    jobs=[['CoinPaprika',async()=>{const rows=await getJson(`${SOURCES.paprika}/tickers?quotes=USD`);if(!Array.isArray(rows)||!rows.length)throw new Error('Ranking indisponível');return rows.map(c=>({symbol:c.symbol,name:c.name,rank:Number(c.rank)})).filter(c=>Number.isInteger(c.rank)&&c.rank>0).sort((a,b)=>a.rank-b.rank).slice(0,config.assetLimit);}]];
    settled=await Promise.allSettled(jobs.map(([,load])=>load()));
  }
  await mexcJob;
  const merged=new Map();
  settled.forEach((result,index)=>{
    const source=jobs[index][0];
    if(result.status==='rejected'){warnings.push(`${source}: ${result.reason.message}`);return;}
    const rows=result.value.filter(c=>Number.isInteger(c.rank)&&c.rank>=1&&c.rank<=config.assetLimit&&/^[a-z0-9]+$/i.test(c.symbol||''));
    if(!rows.length){warnings.push(`${source}: ranking sem ativos válidos`);return;}
    rankings[source]=rows.length;
    const symbols=new Map();for(const c of rows){const symbol=String(c.symbol).toUpperCase();symbols.set(symbol,(symbols.get(symbol)||0)+1);}
    for(const c of rows){const symbol=`${String(c.symbol).toUpperCase()}USDT`;if(symbols.get(String(c.symbol).toUpperCase())>1){if(pairs.has(symbol)||mexcPairs.has(symbol))warnings.push(`${source}: símbolo ambíguo ${symbol}, ignorado nessa fonte`);continue;}const old=merged.get(symbol)||{symbol,name:c.name,rank:c.rank,rankingSources:[],rankings:{}};old.rank=Math.min(old.rank,c.rank);old.rankingSources.push(source);old.rankings[source]=c.rank;merged.set(symbol,old);}
  });
  const tradfiBases=new Set(['OIL','WTI','BRENT','GOLD','SILVER','NVDA','TSLA','AAPL','AMZN','META','COIN','MSTR','NFLX','MSFT','GOOGL','GOOG','MCD','HOOD','CRCL','MU','SOXL','SOXS','HAL','CORZ','SPY','QQQ','ITA','IWF','IWN','IWV','WFC']);
  const tokenizedSymbols=[...mexcPairs.keys()].filter(symbol=>{
    const base=String(symbol).replace(/USDT$/,'').toUpperCase(), metadata=mexcMetadata.get(symbol)||{}, descriptor=`${metadata.baseAsset||''} ${metadata.baseCoin||''} ${metadata.baseCoinName||''} ${metadata.quoteAsset||''}`.toUpperCase();
    return base.endsWith('ON')||base.endsWith('X')||tradfiBases.has(base)||/TOKEN|STOCK|EQUITY|ETF|COMMODIT|GOLD|SILVER|OIL|ONDO|XSTOCK/.test(descriptor);
  });
  const tokenizedCandidates=tokenizedSymbols.filter(symbol=>(mexcVolumes.get(symbol)||0)>=config.minVolume).map((symbol,index)=>({symbol,name:`${mexcMetadata.get(symbol)?.baseAsset||symbol.replace(/USDT$/,'')} · Mercado tradicional tokenizado MEXC`,rank:config.assetLimit+index+1,rankingSources:['MEXC TradFi tokenizados'],rankings:{},source:'MEXC',exchangeSymbol:symbol,volume:mexcVolumes.get(symbol)||0,volume24h:mexcVolumes.get(symbol)||0,tokenized:true,assetClass:'TRADFI_TOKENIZED'}));
  const sources=Object.keys(rankings);
  let mode, candidates;
  if(!sources.length){
    // Contingência: os rankings por capitalização podem bloquear consultas públicas.
    // Mantemos o scanner operacional ordenando os pares Binance por volume USDT 24h.
    warnings.push('Rankings por capitalização indisponíveis; usando ranking fallback por volume 24h da Binance.');
    const fallback=[...volumes.entries()].filter(([symbol,volume])=>pairs.has(symbol)&&!['BTCUSDT','ETHUSDT'].includes(symbol)&&!isStableAsset(symbol)&&Number(volume)>=config.minVolume).sort((a,b)=>b[1]-a[1]).slice(0,config.assetLimit);
    candidates=fallback.map(([symbol,volume],index)=>({symbol,name:symbol.replace(/USDT$/,''),rank:index+1,rankingSources:['Binance volume 24h'],rankings:{'Binance volume 24h':index+1},volume,volume24h:volume}));
    mode='volume 24h Binance (fallback)';
  } else { mode=`market cap (${sources.join(' + ')})`; candidates=[...merged.values()]; }
  const candidateSymbols=new Set(candidates.map(c=>c.symbol));
  candidates.push(...tokenizedCandidates.filter(c=>!candidateSymbols.has(c.symbol)));
  const candidateAudit=candidates.map(c=>{const binance=pairs.has(c.symbol),mexc=mexcPairs.has(c.symbol),source=binance?'BINANCE':(mexc?'MEXC':null),exchangeSymbol=binance?c.symbol:(mexc?mexcPairs.get(c.symbol):null),volume=binance?(volumes.get(c.symbol)||0):(mexc?(mexcVolumes.get(exchangeSymbol)||0):0),stable=isStableAsset(c.symbol);return {symbol:c.symbol,name:c.name,rank:c.rank,source,volume,status:source&&volume>=config.minVolume&&!stable?'eligible':'excluded',reason:stable?'Stablecoin excluída do scanner':!source?'Par USDT não encontrado na Binance ou MEXC':`Volume ${volume.toLocaleString('en-US',{maximumFractionDigits:0})} abaixo do mínimo de US$ ${config.minVolume.toLocaleString('en-US')}`};});
  const seen=new Set();
  const assets=candidates.filter(c=>(pairs.has(c.symbol)||mexcPairs.has(c.symbol)) && !['BTCUSDT','ETHUSDT'].includes(c.symbol) && !isStableAsset(c.symbol) && !seen.has(c.symbol) && (seen.add(c.symbol),true)).map(c=>{const binance=pairs.has(c.symbol),mexc=mexcPairs.has(c.symbol),exchangeSymbol=binance?c.symbol:mexcPairs.get(c.symbol),source=binance?'BINANCE':'MEXC',volume=binance?(volumes.get(c.symbol)||0):(mexc?(mexcVolumes.get(exchangeSymbol)||0):0),price=binance?(prices.get(c.symbol)||0):(mexc?(mexcPrices.get(exchangeSymbol)||0):0);return {...c,source,exchangeSymbol,volume,volume24h:volume,price,lastPrice:price,tokenized:Boolean(c.tokenized),assetClass:c.assetClass||(c.tokenized?'TRADFI_TOKENIZED':'CRYPTO')};}).filter(a=>a.volume >= config.minVolume).sort((a,b)=>(a.tokenized-b.tokenized)||a.rank-b.rank||a.symbol.localeCompare(b.symbol));
  return {assets,mode,warnings,rankings,requestedLimit:config.assetLimit,rankingCandidates:candidates.length,candidateAudit};
}
async function fetchSeries(getJson,symbol,asOf,source=SOURCES.spot) {
  if(source===SOURCES.mexc){const intervals={'1w':'1W','1d':'1D','4h':'4h','2h':'2h','1h':'1h'},values=await Promise.all(INTERVALS.map(async interval=>{const raw=await getJson(`${SOURCES.mexc}/klines?symbol=${encodeURIComponent(symbol)}&interval=${intervals[interval]}&limit=210&endTime=${asOf-1}`);return closedCandles(raw,asOf);}));return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));}
  const values=await Promise.all(INTERVALS.map(interval=>getJson(`${source}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=210&endTime=${asOf-1}`).then(raw=>closedCandles(raw,asOf))));
  return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
}
async function vehicle(getJson,signal,asOf) {
  const spot={...signal,vehicle:'SPOT',leverage:'1×',vehicleReason:`Setup SPOT confirmado na ${signal.source||'BINANCE'}.`};
  if (signal.riskTier==='HIGH_RISK_SPOT') return {...spot,vehicleReason:'Risco entre 4% e 8%; somente SPOT, sem alavancagem.'};
  if (signal.direction==='SHORT') return {...signal,vehicle:'FUTURES',leverage:'3× máx.',vehicleReason:'Direção SHORT: requer mercado de futuros; confirme margem e disponibilidade na corretora.'};
  if(signal.source==='MEXC')return spot;
  try {
    const [series,premium]=await Promise.all([fetchSeries(getJson,signal.symbol,asOf,SOURCES.futures),getJson(`${SOURCES.futures}/premiumIndex?symbol=${signal.symbol}`)]);
    const analyses=analyseSet(series), funding=Number(premium.lastFundingRate);
    if(!analyses || analyses.extension.blocked || analyses.weekly.close < analyses.weekly.ema22 || !confirmedMacro(analyses)) return {...spot,vehicleReason:'Setup SPOT confirmado; futuros sem confirmação suficiente.'};
    const atrPct=analyses.one.atr/analyses.one.close*100;
    if(signal.score>=90 && analyses.one.relativeVolume>=1.25 && atrPct<=3.5 && Number.isFinite(funding) && funding<=.0003) { const leverageCap=signal.riskTier?Math.min(2,signal.maxLeverage||2):(signal.maxLeverage||3); return {...signal,vehicle:'FUTURES',leverage:`${leverageCap}× máx.`,funding,atrPct,vehicleReason:`Futuros confirmados; alavancagem limitada a ${leverageCap}×, ATR ${atrPct.toFixed(1)}% e funding ${(funding*100).toFixed(3)}%.`}; }
    return {...spot,vehicleReason:'Setup SPOT confirmado; volatilidade, volume ou funding não qualificam futuros.'};
  }catch(error){return {...spot,vehicleReason:'Setup SPOT confirmado; consulta de futuros indisponível.',vehicleWarning:error.message};}
}
async function scanMarket(getJson,options=DEFAULTS,onProgress=()=>{}) {
  const config=settings(options), clock=await getJson(`${SOURCES.spot}/time`), asOf=Number(clock.serverTime);
  if(!Number.isFinite(asOf))throw new Error('Horário Binance inválido.');
  const universe=await marketUniverse(getJson,config), signals=[], failures=[], diagnostics=universe.candidateAudit.filter(item=>item.status==='excluded').map(item=>({...item,reasons:[item.reason]})), warnings=[...universe.warnings];let next=0,done=0;
  async function worker(){while(next<universe.assets.length){const asset=universe.assets[next++];const audit={symbol:asset.symbol,name:asset.name,rank:asset.rank,source:asset.source,volume:asset.volume,status:'rejected',reasons:[]};try{const source=asset.source==='MEXC'?SOURCES.mexc:SOURCES.spot,series=await fetchSeries(getJson,asset.exchangeSymbol||asset.symbol,asOf,source), trace=[], signal=evaluate(asset,series,config,trace);audit.reasons=trace.filter(item=>item.reason).map(item=>`${item.strategy}: ${item.reason}`);if(signal){signals.push(signal);audit.status='signal';audit.score=signal.score;audit.strategy=signal.strategyName;}else if(!audit.reasons.length)audit.reasons=['Não atingiu todos os filtros do setup'];}catch(error){failures.push({symbol:asset.symbol,source:asset.source,error:error.message});audit.status='error';audit.reasons=[`Falha de consulta: ${error.message}`];}diagnostics.push(audit);onProgress(++done,universe.assets.length);}}
  await Promise.all(Array.from({length:Math.min(4,universe.assets.length)},worker));
  if(universe.assets.length && failures.length===universe.assets.length)throw new Error(`Todas as ${failures.length} consultas de ativos falharam: ${failures[0].error}`);
  const qualified=consolidate(signals,config.maxSignals), selected=[];
  for(const signal of qualified){const checked=await vehicle(getJson,signal,asOf);selected.push(checked);if(checked.vehicleWarning)warnings.push(`${signal.symbol}: ${checked.vehicleWarning}`);}
  return {signals:selected,assets:universe.assets.length,eligibleAssets:universe.assets.length,requestedLimit:universe.requestedLimit,rankingCandidates:universe.rankingCandidates,diagnostics,mode:universe.mode,failures,warnings,asOf,config,engineVersion:VERSION};
}

return Object.freeze({last,sma,ema,rsi,atr,macd,adx,stochRsi,candlePattern,bullishPivot,supportResistance,weeklyExtension,analyseTimeframe,lateEntry,pullbackStochCriteria,aggressivePullbackCriteria,pullback1hConfirmationCriteria,VERSION,SOURCES,DEFAULTS,STRATEGIES,settings,closedCandles,confirmedMacro,analyseSet,evaluateAnalyses,evaluate,compareSignals,consolidate,isFresh,rankingLabel,marketUniverse,fetchSeries,vehicle,scanMarket});
});
