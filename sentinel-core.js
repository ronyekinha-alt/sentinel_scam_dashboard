/* Motor único para painel e Telegram. Governança, risco e roteamento multi-corretora v2026-10-20. */
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
  const closes = candles.map(c => c.close), volumes = candles.map(c => c.volume), sellVolumes = candles.map(c => c.takerBuyVolume == null ? (c.close < c.open ? c.volume : c.volume * .4) : c.volume - c.takerBuyVolume), e8 = ema(closes, 8), e9 = ema(closes, 9), e22 = ema(closes, 22), e51 = ema(closes, 51), e80 = ema(closes, 80), e200 = ema(closes, 200), rs = rsi(closes), mc = macd(closes), volumeAvg = sma(volumes, 20), sellAvg = sma(sellVolumes, 20), dx = adx(candles), stoch = stochRsi(closes);
  const i = closes.length - 1, aligned = closes[i] > e9[i] && e9[i] > e22[i] && e22[i] > e51[i] && e51[i] > e80[i], rising = e22[i] > e22[i - 3], momentum = rs[i] >= 50 && rs[i] <= 72 && mc.histogram[i] > 0, relativeVolume = volumes[i] / Math.max(volumeAvg[i] || volumes[i], .00001), strong = (dx[i] || 0) >= 18, stochCrossUp = stoch.k[i] > stoch.d[i] && (stoch.k[i - 1] <= stoch.d[i - 1] || stoch.k[i - 2] <= stoch.d[i - 2]) && Math.min(stoch.k[i - 1], stoch.d[i - 1], stoch.k[i - 2], stoch.d[i - 2]) < 25, stochRecovery = stoch.k[i] > stoch.d[i] && stoch.k[i] <= 50 && Math.min(stoch.k[i - 1], stoch.k[i - 2]) < 25, sellerDrying = sellVolumes[i] <= (sellAvg[i] || sellVolumes[i]) * .9, buyerDominance = candles[i].takerBuyVolume == null ? candles[i].close > candles[i].open && relativeVolume >= 1.05 : candles[i].takerBuyVolume / Math.max(volumes[i], Number.EPSILON) >= .51;
  return { aligned, rising, momentum, relativeVolume, strong, rsi: rs[i], adx: dx[i] || 0, atr: last(atr(candles)), ema8: e8[i], ema9: e9[i], ema22: e22[i], ema51: e51[i], ema80: e80[i], ema200: e200[i], macdLine: mc.line[i], macdHistogram: mc.histogram[i], stochK: stoch.k[i], stochD: stoch.d[i], stochCrossUp, stochRecovery, sellerDrying, buyerDominance, sellVolume: sellVolumes[i], previousSellVolume: sellVolumes[i - 1], previousSellAverage: sellAvg[i - 1], previousSellerExhaustion: sellVolumes[i - 1] <= Math.max(sellAvg[i - 1] || sellVolumes[i - 1], Number.EPSILON), lastLow: candles[i].low, recentLow: Math.min(...candles.slice(-10).map(c => c.low)), close: last(closes), pattern: candlePattern(candles), pivot: bullishPivot(candles), levels: supportResistance(candles, last(closes)) };
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
  // O candle imediatamente anterior não pode mostrar venda acima da média: isso
  // diferencia uma correção saudável de uma possível reversão de tendência.
  const volumeExhaustion = one.previousSellerExhaustion !== false;
  const confirmation = two.close >= two.ema51 && (two.pivot.bullish || two.pattern.bullish || two.momentum) && (one.buyerDominance || one.relativeVolume >= .9) && volumeExhaustion;
  return { valid: macro && pullback1h && confirmation, pullback1h, confirmation, volumeExhaustion };
}
function pullback1hConfirmationCriteria(extension, day, confirmation, one) {
  const macro = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && day.close >= day.ema51 && day.rsi >= 45 && day.macdHistogram >= 0;
  const pullback1h = one.close >= one.ema51 && (one.recentLow <= one.ema9 * 1.02 || one.recentLow <= one.ema22 * 1.02) && (one.pivot.bullish || one.pattern.bullish);
  const confirmed = confirmation.close >= confirmation.ema51 && confirmation.aligned && confirmation.rising && (confirmation.pivot.bullish || confirmation.pattern.bullish || confirmation.momentum) && one.previousSellerExhaustion !== false;
  return { valid: macro && pullback1h && confirmed, pullback1h, confirmed };
}
const VERSION = '2026-10-20-multivenue-v4';
const SOURCES = Object.freeze({ spot: 'https://data-api.binance.vision/api/v3', futures: 'https://fapi.binance.com/fapi/v1', futuresData: 'https://fapi.binance.com/futures/data', mexc: 'https://api.mexc.com/api/v3', okx: 'https://www.okx.com/api/v5', coinbase: 'https://api.coinbase.com/api/v3/brokerage/market', ranking: 'https://api.coingecko.com/api/v3', cmc: 'https://pro-api.coinmarketcap.com/public-api/v3', paprika: 'https://api.coinpaprika.com/v1' });
const DEFAULTS = Object.freeze({ minScore: 90, minVolume: 1000000, assetLimit: 700, strategy: 'both', maxSignals: 20, enforceRiskPolicy: false, maxEntryDeviationPct: 2, minimumRewardRisk: 1.7, allowMexcTradfi: true });
const INTERVALS = ['1w', '1d', '4h', '2h', '1h'];
const STABLE_BASES = new Set(['USDT','USDC','USDE','USD1','DAI','FDUSD','TUSD','USDD','BUSD','PYUSD','USDP','FRAX','GUSD','EURC','EURS','USDY']);
const VENUE_PRIORITY = Object.freeze(['BINANCE','OKX','MEXC','COINBASE']);
const QUOTE_PRIORITY = Object.freeze(['USDT','USDC']);
function baseOf(symbol) { return String(symbol||'').toUpperCase().replace(/[-_/]/g,'').replace(/(USDT|USDC|USD)$/, ''); }
function isStableAsset(symbol) { return STABLE_BASES.has(baseOf(symbol)); }
function canonicalSymbol(base) { return `${baseOf(base)}USDT`; }
function sourceForAsset(asset = {}) { return ({ BINANCE:SOURCES.spot, OKX:SOURCES.okx, MEXC:SOURCES.mexc, COINBASE:SOURCES.coinbase })[String(asset.source||'BINANCE').toUpperCase()] || SOURCES.spot; }
function sourceLabel(asset = {}) { const venue=String(asset.source||'BINANCE').toUpperCase(), pair=asset.exchangeSymbol||asset.symbol, quote=asset.quoteAsset||'USDT'; return `${venue} · ${pair||canonicalSymbol(asset.symbol)}${quote&&pair&&!String(pair).endsWith(quote)?`/${quote}`:''}`; }
// Símbolos exclusivos das versões tokenizadas. Tickers genéricos (como META ou COIN)
// não entram aqui, pois também podem representar projetos cripto legítimos.
const TRADFI_BASES = new Set(['KORUB','SOXLB','TSLAB']);
function isTradfiTokenized(asset = {}) { const base=baseOf(asset.symbol||asset.baseAsset||asset.baseCoin), descriptor=`${asset.name||''} ${asset.baseAsset||''} ${asset.baseCoin||''} ${asset.baseCoinName||''} ${asset.assetClass||''}`.toUpperCase(); return Boolean(asset.tokenized)||asset.assetClass==='TRADFI_TOKENIZED'||TRADFI_BASES.has(base)||/\b(BSTOCKS?|XSTOCKS?|TOKENIZED\s*(STOCK|EQUITY|ETF|ASSET)?|TRADFI|STOCK|EQUITY|ETF|COMMODIT(Y|IES)|INDEX\s*FUND|LEVERAGED\s+(BULL|BEAR))\b/.test(descriptor); }
function nthWeekdayOfMonth(year,month,weekday,nth){const date=new Date(Date.UTC(year,month,1)),offset=(weekday-date.getUTCDay()+7)%7;return 1+offset+(nth-1)*7;}
function lastWeekdayOfMonth(year,month,weekday){const date=new Date(Date.UTC(year,month+1,0)),offset=(date.getUTCDay()-weekday+7)%7;return date.getUTCDate()-offset;}
function observedFixedHoliday(year,month,day){const date=new Date(Date.UTC(year,month,day)),weekday=date.getUTCDay();if(weekday===6)return {month,day:day-1};if(weekday===0)return {month,day:day+1};return {month,day};}
function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31)-1,day=(h+l-7*m+114)%31+1;return {month,day};}
function isUsMarketHoliday(year,month,day){const fixed=[[0,1],[5,19],[6,4],[11,25]].map(([m,d])=>observedFixedHoliday(year,m,d));if(fixed.some(date=>date.month===month&&date.day===day))return true;if(month===0&&day===nthWeekdayOfMonth(year,0,1,3))return true;if(month===1&&day===nthWeekdayOfMonth(year,1,1,3))return true;if(month===4&&day===lastWeekdayOfMonth(year,4,1))return true;if(month===8&&day===nthWeekdayOfMonth(year,8,1,1))return true;if(month===10&&day===nthWeekdayOfMonth(year,10,4,4))return true;const easter=easterSunday(year),goodFriday=new Date(Date.UTC(year,easter.month,easter.day-2));return goodFriday.getUTCMonth()===month&&goodFriday.getUTCDate()===day;}
function isUsRegularMarketSession(asOf = Date.now()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(asOf)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const minute=Number(parts.hour)*60+Number(parts.minute), year=Number(parts.year), month=Number(parts.month)-1, day=Number(parts.day);
  return !['Sat','Sun'].includes(parts.weekday) && !isUsMarketHoliday(year,month,day) && minute>=9*60+30 && minute<16*60;
}
const STRATEGIES = Object.freeze({ trend: 'Tendência + pivô', 'aggressive-pullback': 'Pullback 2H + confirmação 4H', 'flexible-pullback-2h': 'Pullback 2H · diário flexível', 'ema-cross-retest-2h': 'Cruzamento EMA 9 + reteste 22/52 · 2H', 'compression-expansion-1h': '1H antecipado · Compressão + expansão', 'vwap-retest-1h-2h': 'Experimental · VWAP semanal + reteste', 'rsi-ema-recovery': 'Experimental · Recuperação RSI + EMA 8/22/80', 'double-oversold-bounce': 'Experimental · Double Oversold Bounce · 2H', 'bearish-breakdown': 'SHORT · Tendência baixista + rompimento' });
function settings(input = {}) {
  const result = { ...DEFAULTS, ...input };
  const selectedStrategies = Array.isArray(result.strategies) ? [...new Set(result.strategies)] : null;
  if (![0, 85, 90, 100].includes(Number(result.minScore))) throw new Error('Score mínimo deve ser 85, 90, 100 ou todos os scores.');
  if (![0, 1000000, 2000000, 5000000].includes(Number(result.minVolume))) throw new Error('Volume mínimo inválido.');
  if (!Number.isInteger(Number(result.assetLimit)) || result.assetLimit < 1 || result.assetLimit > 700) throw new Error('Limite de ativos deve estar entre 1 e 700.');
  if (!['both', ...Object.keys(STRATEGIES)].includes(result.strategy)) throw new Error('Setup ao vivo inválido.');
  if (selectedStrategies && (!selectedStrategies.length || selectedStrategies.some(strategy => !Object.hasOwn(STRATEGIES, strategy)))) throw new Error('Selecione ao menos um setup válido.');
  if (!Number.isFinite(Number(result.maxEntryDeviationPct)) || Number(result.maxEntryDeviationPct) < 0 || Number(result.maxEntryDeviationPct) > 5) throw new Error('Distância máxima da entrada inválida.');
  if (!Number.isFinite(Number(result.minimumRewardRisk)) || Number(result.minimumRewardRisk) < 1 || Number(result.minimumRewardRisk) > 2) throw new Error('Risco-retorno mínimo de entrada inválido.');
  return { ...result, strategies: selectedStrategies, minScore: Number(result.minScore), minVolume: Number(result.minVolume), assetLimit: Number(result.assetLimit), maxSignals: 20, enforceRiskPolicy: Boolean(result.enforceRiskPolicy), maxEntryDeviationPct: Number(result.maxEntryDeviationPct), minimumRewardRisk: Number(result.minimumRewardRisk), allowMexcTradfi: Boolean(result.allowMexcTradfi) };
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
  const closes = candles.map(candle => candle.close), e9 = ema(closes,9), e22 = ema(closes,22), e52 = ema(closes,52), i = closes.length - 1;
  const crossedRecently = Array.from({length:Math.min(10,i-1)},(_,offset)=>i-offset).some(index=>e9[index]>e22[index]&&e9[index]>e52[index]&&(e9[index-1]<=e22[index-1]||e9[index-1]<=e52[index-1]));
  const retest = candles.slice(-8,-1).some((candle,offset)=>{const index=i-7+offset,range=Math.max(candle.high-candle.low,Number.EPSILON),lower=Math.min(candle.open,candle.close)-candle.low,wick=lower/range;return (candle.low<=e22[index]*1.018||candle.low<=e52[index]*1.025)&&wick>=.30;});
  const previousHigh = Math.max(...candles.slice(-7,-1).map(candle=>candle.high));
  const closedBreakout = timing.close>previousHigh && candles.at(-1).close>candles.at(-1).open;
  const structure = timing.close>timing.ema9&&timing.ema9>timing.ema22&&timing.ema22>timing.ema51;
  const fourEma22=ema(series['4h'].map(candle=>candle.close),22), macro=!extension.blocked&&extension.weekly.close>=extension.weekly.ema22&&day.close>=day.ema80&&day.rsi>=42&&four.close>=four.ema51&&fourEma22.at(-1)>=fourEma22.at(-3)&&four.rsi>=45;
  const recentRise=(timing.close/candles.at(-7).close-1)*100;
  const valid=crossedRecently&&retest&&closedBreakout&&structure&&macro&&timing.relativeVolume>=1&&timing.rsi>=50&&timing.rsi<=72&&recentRise<=11;
  return {valid,crossedRecently,retest,closedBreakout,structure,macro,recentRise,previousHigh};
}
function compressionExpansion1hCriteria(series, analyses) {
  const candles=series['1h'], timing=analyses.one, {day,four}=analyses;
  if (!Array.isArray(candles) || candles.length < 80) return {valid:false,reason:'Candles 1H insuficientes para a base de compressão'};
  const closes=candles.map(candle=>candle.close), e8=ema(closes,8), e22=ema(closes,22), rs=rsi(closes,14), rsAverage=sma(rs.map(value=>Number.isFinite(value)?value:0),14), i=candles.length-1;
  const base=candles.slice(-19,-1), baseHigh=Math.max(...base.map(candle=>candle.high)), baseLow=Math.min(...base.map(candle=>candle.low)), baseRangePct=(baseHigh/baseLow-1)*100;
  const volumeWindow=candles.slice(-21,-1), averageVolume=volumeWindow.reduce((sum,candle)=>sum+Number(candle.volume||0),0)/Math.max(volumeWindow.length,1), volumeRatio=Number(candles[i].volume||0)/Math.max(averageVolume,Number.EPSILON);
  const breakoutPct=(timing.close/baseHigh-1)*100, candle=candles[i], closeLocation=(candle.close-candle.low)/Math.max(candle.high-candle.low,Number.EPSILON);
  const rsiCross=[i,i-1].some(index=>index>0&&Number.isFinite(rs[index])&&Number.isFinite(rsAverage[index])&&rs[index]>rsAverage[index]&&rs[index-1]<=rsAverage[index-1]);
  const rsiHealthy=timing.rsi>=48&&timing.rsi<=68&&rsAverage[i]>=48&&rsAverage[i]<=68&&rs[i]>rs[i-1]&&rsAverage[i]>=rsAverage[i-1];
  const priceStructure=timing.close>timing.ema8&&timing.close>timing.ema22&&e8[i]>e8[i-2];
  const dailyContext=day.close>=day.ema80*.985&&day.rsi>=42&&four.close>=four.ema80*.98&&four.rsi>=42;
  const valid=baseRangePct<=12&&timing.close>baseHigh&&breakoutPct<=4.5&&candle.close>candle.open&&closeLocation>=.58&&volumeRatio>=1.5&&priceStructure&&rsiCross&&rsiHealthy&&dailyContext;
  return {valid,baseHigh,baseLow,baseRangePct,averageVolume,volumeRatio,breakoutPct,closeLocation,rsiCross,rsiHealthy,priceStructure,dailyContext};
}
function resampleHourly(candles, hours) {
  const buckets = new Map();
  for (const candle of candles || []) {
    const time = Math.floor(candle.time / (hours * 3600000)) * hours * 3600000;
    const prior = buckets.get(time);
    if (!prior) buckets.set(time, { ...candle, time, closeTime:candle.closeTime, volume:candle.volume, takerBuyVolume:candle.takerBuyVolume });
    else {
      prior.high=Math.max(prior.high,candle.high); prior.low=Math.min(prior.low,candle.low); prior.close=candle.close; prior.closeTime=candle.closeTime;
      prior.volume+=candle.volume; prior.takerBuyVolume=prior.takerBuyVolume==null||candle.takerBuyVolume==null?null:prior.takerBuyVolume+candle.takerBuyVolume;
    }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}
function weekStartUtc(time) { const date=new Date(time), day=(date.getUTCDay()+6)%7; return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-day); }
function anchoredWeeklyVwap(candles) {
  const start=weekStartUtc(candles.at(-1)?.time||0), values=[]; let pv=0, volume=0;
  for(const candle of candles){ if(candle.time<start){ values.push(null); continue; } const typical=(candle.high+candle.low+candle.close)/3, v=Math.max(0,Number(candle.volume)||0); pv+=typical*v; volume+=v; values.push(volume?pv/volume:null); }
  return values;
}
function bollingerKeltner(candles) {
  const closes=candles.map(c=>c.close), middle=sma(closes,20), deviations=closes.map((_,i)=>i<19?null:Math.sqrt(closes.slice(i-19,i+1).reduce((sum,value)=>sum+(value-middle[i])**2,0)/20)), averageTrueRange=atr(candles,20), upper=middle.map((value,i)=>value==null?null:value+2*deviations[i]), lower=middle.map((value,i)=>value==null?null:value-2*deviations[i]), kcUpper=middle.map((value,i)=>value==null?null:value+1.5*averageTrueRange[i]), kcLower=middle.map((value,i)=>value==null?null:value-1.5*averageTrueRange[i]);
  const squeezed=upper.map((value,i)=>value!=null&&value<kcUpper[i]&&lower[i]>kcLower[i]);
  return {middle,upper,lower,kcUpper,kcLower,squeezed};
}
function cvdProxy(candles) {
  let cumulative=0; return candles.map(candle=>{const buy=Number.isFinite(candle.takerBuyVolume)?candle.takerBuyVolume:candle.volume*(candle.close>=candle.open?.58:.42); cumulative+=buy-(candle.volume-buy); return cumulative;});
}
function vwapRetestCriteria(series, analyses, timeframe) {
  const candles=series[timeframe], timing={'1h':analyses.one,'2h':analyses.two}[timeframe];
  if(!candles||!timing||candles.length<40)return {valid:false,reason:'Candles insuficientes para VWAP semanal'};
  const vwap=anchoredWeeklyVwap(candles), bands=bollingerKeltner(candles), cvd=cvdProxy(candles), i=candles.length-1, current=candles[i], value=vwap[i];
  if(!Number.isFinite(value))return {valid:false,reason:'VWAP semanal ainda indisponível'};
  const average=candles.slice(-21,-1).reduce((sum,c)=>sum+c.volume,0)/20, volumeRatio=current.volume/Math.max(average,Number.EPSILON), retest=candles.slice(-4,-1).some((c,index)=>c.low<=vwap[i-3+index]*1.003&&c.close>=vwap[i-3+index]*.997), brokeRecently=candles.slice(-12,-1).some((c,index)=>c.close<=vwap[i-11+index])&&current.close>value, buyer=current.close>current.open&&(timing.pattern.bullish||timing.buyerDominance), squeezeReleased=bands.squeezed.slice(-7,-1).some(Boolean)&&!bands.squeezed[i], cvdRising=cvd[i]>cvd[Math.max(0,i-6)];
  const macro=!analyses.extension.blocked&&analyses.day.close>=analyses.day.ema80*.98&&analyses.four.close>=analyses.four.ema51&&analyses.four.rsi>=45;
  return {valid:macro&&brokeRecently&&retest&&buyer&&volumeRatio>=1.5, vwap:value, volumeRatio, retest, brokeRecently, buyer, macro, squeezeReleased, cvdRising};
}
function marketRegimeGate(analyses) {
  const four=analyses?.four;
  const veto=Boolean(four&&four.close<four.ema22&&(four.macdHistogram<0||four.rsi<48));
  return {available:Boolean(four),vetoLongs:veto,status:veto?'VETO':'NORMAL',label:veto?'Veto Sistêmico Ativo: BTC em tendência de baixa intradiária':'Regime BTC liberado para novos LONGs',close:four?.close??null,ema22:four?.ema22??null,rsi:four?.rsi??null,macdHistogram:four?.macdHistogram??null};
}
function rsiEmaRecoveryCriteria(series, analyses, timeframe) {
  const candles=timeframe==='8h'?resampleHourly(series['1h'],8):series[timeframe];
  if (!Array.isArray(candles) || candles.length<90) return {valid:false,reason:`Candles ${timeframe.toUpperCase()} insuficientes para recuperação RSI/EMA`};
  const closes=candles.map(c=>c.close), e8=ema(closes,8), e22=ema(closes,22), e80=ema(closes,80), rs=rsi(closes,14), i=candles.length-1;
  const crossed=e8[i]>e22[i]&&e8[i]>e80[i]&&(e8[i-1]<=e22[i-1]||e8[i-1]<=e80[i-1]);
  const touches=[];
  for(let index=15;index<=i;index++) if(Number.isFinite(rs[index])&&rs[index]<=30&&rs[index-1]>30) touches.push(index);
  const latestTouch=touches.at(-1), touchCount=touches.length, minDays=touchCount>=2?7:8;
  const elapsedDays=latestTouch==null?0:(candles[i].time-candles[latestTouch].time)/86400000;
  const stopBase=latestTouch==null?null:Math.min(...candles.slice(latestTouch,i+1).map(c=>c.low));
  const analysis=analyseTimeframe(candles), nearEma8=(analysis.close/Math.max(e8[i],Number.EPSILON)-1)*100;
  const dailyContext=analyses.day.close>=analyses.day.ema80*.90&&!analyses.extension.blocked;
  const valid=crossed&&latestTouch!=null&&elapsedDays>=minDays&&nearEma8<=3&&analysis.rsi<=72&&dailyContext&&Number.isFinite(stopBase);
  return {valid,candles,analysis,crossed,touchCount,minDays,elapsedDays,latestTouch,stopBase,nearEma8,dailyContext};
}
function doubleOversoldBounceCriteria(series, analyses) {
  const candles=series['2h'], daily=series['1d'];
  if (!Array.isArray(candles) || candles.length < 90 || !Array.isArray(daily) || daily.length < 90) return {valid:false,reason:'Candles insuficientes para Double Oversold Bounce'};
  const closes=candles.map(c=>c.close), dailyCloses=daily.map(c=>c.close), e22=ema(closes,22), e80=ema(closes,80), dailyEma22=ema(dailyCloses,22), i=candles.length-1, candle=candles[i];
  const range=Math.max(candle.high-candle.low,Number.EPSILON), lowerWick=(Math.min(candle.open,candle.close)-candle.low)/range;
  const macro=analyses.day.close>=analyses.day.ema80 || (analyses.day.close>=dailyEma22.at(-1) && dailyEma22.at(-1)>=dailyEma22[Math.max(0,dailyEma22.length-6)]);
  const staticSupport=Math.min(...candles.slice(-30).map(c=>c.low));
  const supports=[['EMA 22 do 2H',e22[i]],['EMA 80 do 2H',e80[i]],['EMA 80 do diário',analyses.day.ema80],['suporte estático',staticSupport]].filter(([,level])=>Number.isFinite(level)&&level>0).map(([label,level])=>({label,level,distance:Math.abs(candle.close-level)/candle.close})).sort((a,b)=>a.distance-b.distance);
  const support=supports[0];
  const valid=macro&&analyses.two.stochK<=5&&analyses.two.rsi<=38&&candle.close>=candle.open&&lowerWick>=.35&&support?.distance<=.02;
  return {valid,macro,lowerWick,support,stochK:analyses.two.stochK,rsi:analyses.two.rsi};
}
function evaluateDoubleOversoldBounce(asset, series, analyses, config, triggerTimeframe, reject) {
  if (triggerTimeframe!=='2h') return reject('O Double Oversold Bounce usa confirmação fechada no 2H');
  const setup=doubleOversoldBounceCriteria(series,analyses);
  if (!setup.valid) return reject('Macro diário, sobrevenda dupla, suporte ou pavio de rejeição ainda não confirmou');
  const entry=analyses.two.close, stop=entry*.94, tp2=entry*1.05, risk=entry-stop, latestPrice=Number(asset.price??asset.lastPrice);
  if (![entry,stop,tp2,risk].every(Number.isFinite)||risk<=0) return reject('Níveis do Double Oversold Bounce inválidos');
  if (Number.isFinite(latestPrice)&&latestPrice>0) { const deviation=Math.abs(latestPrice/entry-1)*100; if (latestPrice<=stop) return reject('Sinal vencido: preço já perdeu o stop de 6%'); if (latestPrice>=tp2) return reject('Sinal vencido: preço já atingiu o alvo de 5%'); if (deviation>config.maxEntryDeviationPct) return reject(`Entrada distante do fechamento 2H (${deviation.toFixed(1)}%)`); }
  const score=92;
  if (score<config.minScore) return reject(`Score ${score}, abaixo do mínimo ${config.minScore}`);
  return {...asset,source:asset.source||'BINANCE',direction:'LONG',strategy:'double-oversold-bounce',strategyName:STRATEGIES['double-oversold-bounce'],setup:STRATEGIES['double-oversold-bounce'],tier:'WATCH',tierLabel:'EXPERIMENTAL · CONFIRME O GRÁFICO',triggerTimeframe:'2h',triggerLabel:'2H · sobrevenda dupla + pavio de rejeição',timeframe:'2H',score,entry,maxEntry:entry*(1+config.maxEntryDeviationPct/100),minimumRewardRisk:.83,stop,tp2,tp3:tp2,target:tp2,targetLabel:'ALVO 5%',target3Label:'ALVO 5%',candleTime:series['2h'].at(-1).time,rsi:setup.rsi,adx:analyses.two.adx,volumeRatio:analyses.two.relativeVolume,context:'Experimental: macro diário acima da EMA 80 ou ascendente; Stoch RSI 2H ≤ 5, RSI ≤ 38 e rejeição em suporte.',trigger:`Stoch RSI ${setup.stochK.toFixed(1)} · RSI ${setup.rsi.toFixed(1)} · ${setup.support.label} a ${(setup.support.distance*100).toFixed(1)}%`,entryStretchPct:0,entryWarning:'Melhor configuração consistente no estudo: stop fixo 6%, alvo 5% e projeção até 3×; acerto entre 75% e 77,8%. Confirmar visualmente.',support:setup.support.level,resistance:null,weeklyRise:analyses.extension.rise12,weeklyRsi:analyses.extension.weekly.rsi,lateEntryAllowed:false,riskPct:.06,maxLeverage:3,riskTier:'EXPERIMENTAL_3X',engineVersion:VERSION};
}
function bearishBreakdownCriteria(series, analyses, timeframe) {
  const candles=series[timeframe], timing={'1h':analyses.one,'2h':analyses.two,'4h':analyses.four}[timeframe];
  if (!Array.isArray(candles) || candles.length<80 || !timing) return {valid:false,reason:'Candles insuficientes para o rompimento baixista'};
  const down=t=>t.close<t.ema9&&t.ema9<t.ema22&&t.ema22<t.ema51&&t.ema51<t.ema80;
  const dailyDown=analyses.day.close<analyses.day.ema51&&analyses.day.ema9<analyses.day.ema22&&analyses.day.ema22<analyses.day.ema51&&analyses.day.rsi<=58&&analyses.day.macdHistogram<0;
  const fourDown=analyses.four.close<analyses.four.ema51&&analyses.four.ema9<analyses.four.ema22&&analyses.four.ema22<analyses.four.ema51&&analyses.four.macdHistogram<0;
  const twoDown=analyses.two.close<analyses.two.ema51&&analyses.two.ema9<analyses.two.ema22&&analyses.two.ema22<analyses.two.ema51&&analyses.two.macdHistogram<0;
  const previousLow=Math.min(...candles.slice(-8,-1).map(c=>c.low)), candle=candles.at(-1);
  const closedBreakdown=timing.close<previousLow&&candle.close<candle.open;
  const bearishPattern=timing.pattern?.side==='VENDA';
  const valid=dailyDown&&fourDown&&twoDown&&down(timing)&&timing.rsi>=32&&timing.rsi<=62&&timing.macdHistogram<0&&timing.relativeVolume>=1.05&&(closedBreakdown||bearishPattern);
  return {valid,dailyDown,fourDown,twoDown,previousLow,closedBreakdown,bearishPattern};
}
function evaluateBearishBreakdown(asset, series, analyses, config, triggerTimeframe, reject) {
  if (!['1h','2h','4h'].includes(triggerTimeframe)) return reject('O setup SHORT usa gatilho fechado em 1H, 2H ou 4H');
  const bearish=bearishBreakdownCriteria(series,analyses,triggerTimeframe), timing={'1h':analyses.one,'2h':analyses.two,'4h':analyses.four}[triggerTimeframe], candles=series[triggerTimeframe];
  if (!bearish.valid) return reject('Tendência baixista, rompimento fechado, volume ou RSI do SHORT ainda não confirmou');
  const entry=timing.close, stopBase=Math.max(...candles.slice(-4,-1).map(c=>c.high)), stop=stopBase+timing.atr*.12, risk=stop-entry, tp2=entry-2*risk, tp3=entry-3*risk;
  if (![entry,stop,risk,tp2,tp3].every(Number.isFinite)||risk<=0||tp2<=0) return reject('Risco ou níveis do SHORT inválidos');
  const riskPct=risk/entry;
  if(riskPct>.08) return reject(`Stop do SHORT muito distante (${(riskPct*100).toFixed(1)}%)`);
  if((entry-tp2)/entry<.03) return reject('Alvo 2R do SHORT abaixo do mínimo de 3%');
  if(timing.levels.support&&entry-timing.levels.support<2*risk) return reject('Suporte não deixa espaço mínimo de 2R para o SHORT');
  const tickerPrice=Number(asset.price??asset.lastPrice), latestPrice=Number.isFinite(tickerPrice)&&tickerPrice>0?tickerPrice:(series['1h']?.at(-1)?.close??entry);
  const minEntry=(tp2+config.minimumRewardRisk*stop)/(1+config.minimumRewardRisk);
  if(Number.isFinite(latestPrice)){
    if(latestPrice>=stop) return reject(`Sinal SHORT vencido: preço atual já rompeu o stop`);
    if(latestPrice<=tp2) return reject(`Sinal SHORT vencido: preço atual já atingiu o TP 2R`);
    const progress=(entry-latestPrice)/Math.max(entry-tp2,Number.EPSILON);
    if(progress>=.5) return reject(`Entrada SHORT esticada: preço já percorreu ${(progress*100).toFixed(0)}% até o TP 2R`);
    if(latestPrice<minEntry) return reject(`Entrada SHORT expirada: preço atual já ficou abaixo do limite para manter ${config.minimumRewardRisk.toFixed(1)}R`);
    const deviation=Math.abs(latestPrice/entry-1)*100;
    if(config.maxEntryDeviationPct>0&&deviation>config.maxEntryDeviationPct) return reject(`Entrada SHORT distante do preço atual (${deviation.toFixed(1)}%)`);
  }
  let score=70;
  if(bearish.dailyDown)score+=7;if(bearish.fourDown)score+=6;if(bearish.twoDown)score+=5;
  if(bearish.closedBreakdown)score+=7;if(bearish.bearishPattern)score+=3;if(timing.relativeVolume>=1.25)score+=5;if(timing.strong)score+=3;
  score=Math.min(score,100);if(score<config.minScore)return reject(`Score ${score}, abaixo do mínimo ${config.minScore}`);
  const stretchPct=timing.ema9?(entry/timing.ema9-1)*100:0, highRisk=riskPct>.04;
  return {...asset,source:asset.source||'BINANCE',direction:'SHORT',strategy:'bearish-breakdown',strategyName:STRATEGIES['bearish-breakdown'],setup:STRATEGIES['bearish-breakdown'],tier:score>=90?'VALIDATED':'WATCH',tierLabel:score>=90?'ENTRADA VALIDADA':'SETUP FORTE · AGUARDAR CONFIRMAÇÃO',triggerTimeframe,triggerLabel:triggerTimeframe.toUpperCase(),timeframe:triggerTimeframe.toUpperCase(),score,entry,minEntry,minimumRewardRisk:config.minimumRewardRisk,stop,tp2,tp3,target:tp2,candleTime:candles.at(-1).time,rsi:timing.rsi,adx:timing.adx,volumeRatio:timing.relativeVolume,context:'Macro SHORT: diário · 4H · 2H em tendência baixista; rompimento fechado no gatilho',trigger:`Rompimento baixista fechado · RSI ${timing.rsi.toFixed(1)} · volume ${timing.relativeVolume.toFixed(2)}x`,entryStretchPct:stretchPct,entryWarning:highRisk?'Risco acima de 4%; reduzir exposição e confirmar resistência':'Entrada válida acima de '+minEntry.toFixed(8)+' para preservar '+config.minimumRewardRisk.toFixed(1)+'R',support:timing.levels.support,resistance:timing.levels.resistance,weeklyRise:analyses.extension.rise12,weeklyRsi:analyses.extension.weekly.rsi,lateEntryAllowed:false,riskPct,maxLeverage:config.enforceRiskPolicy?2:3,riskTier:config.enforceRiskPolicy?'STANDARD_LEVERAGE_2X':null,engineVersion:VERSION};
}
function evaluateAnalyses(asset, series, analyses, strategy, options = DEFAULTS, triggerTimeframe = '2h') {
  const config = settings(options);
  const diagnostic = arguments[6];
  const reject = reason => { if (diagnostic && !diagnostic.reason) diagnostic.reason = reason; return null; };
  if (!analyses || !Object.hasOwn(STRATEGIES,strategy) || !['1h','2h','4h','8h','1d'].includes(triggerTimeframe)) return reject('Dados de candles insuficientes ou configuração inválida');
  if (strategy==='bearish-breakdown') return evaluateBearishBreakdown(asset,series,analyses,config,triggerTimeframe,reject);
  if (strategy==='double-oversold-bounce') return evaluateDoubleOversoldBounce(asset,series,analyses,config,triggerTimeframe,reject);
  const { extension, day:d, four, two, one } = analyses;
  const recovery=strategy==='rsi-ema-recovery'?rsiEmaRecoveryCriteria(series,analyses,triggerTimeframe):null;
  const timing = recovery?.analysis || { '1h':one,'2h':two,'4h':four,'1d':d }[triggerTimeframe], triggerSeries = recovery?.candles || series[triggerTimeframe], emaCross = strategy==='ema-cross-retest-2h' ? emaCrossRetest2hCriteria(series,analyses) : null, early1h=strategy==='compression-expansion-1h'?compressionExpansion1hCriteria(series,analyses):null, vwap=strategy==='vwap-retest-1h-2h'?vwapRetestCriteria(series,analyses,triggerTimeframe):null;
  const triggerBullish = timing?.pattern?.bullish || timing?.pivot?.bullish || early1h?.valid || recovery?.valid || vwap?.buyer;
  if (!triggerSeries?.length) return reject('Sem candles fechados no tempo do gatilho');
  if (!triggerBullish && !emaCross?.closedBreakout) return reject('Sem padrão comprador, pivô ou rompimento fechado no gatilho');
  const flexibleMacro = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && d.close >= d.ema80 && d.rsi >= 40 && four.aligned && four.rising && two.close >= two.ema51 && one.aligned && one.momentum;
  if (strategy==='rsi-ema-recovery' ? !recovery.valid : strategy==='ema-cross-retest-2h' ? (triggerTimeframe!=='2h'||!emaCross.valid) : strategy==='compression-expansion-1h' ? (triggerTimeframe!=='1h'||!early1h.valid) : strategy==='vwap-retest-1h-2h' ? (!['1h','2h'].includes(triggerTimeframe)||!vwap.valid) : strategy === 'flexible-pullback-2h' ? (!flexibleMacro || triggerTimeframe !== '2h') : !confirmedMacro(analyses)) return reject(strategy==='rsi-ema-recovery'?'RSI <= 30, espera mínima e cruzamento EMA 8 acima de 22/80 ainda não confirmados':strategy==='ema-cross-retest-2h' ? 'Cruzamento, reteste, rompimento ou macro 2H não confirmado' :strategy==='vwap-retest-1h-2h'?'VWAP semanal, reteste, volume ou contexto macro ainda não confirmou':strategy==='compression-expansion-1h'?'Base, rompimento, volume, RSI ou contexto diário ainda não confirmou':'Confirmação multi-tempo insuficiente');
  const trendValid = !extension.blocked && extension.weekly.close >= extension.weekly.ema22 && d.close >= d.ema51 && d.rsi >= 48 && four.close >= four.ema51 && two.close >= two.ema51 && timing.close >= timing.ema51 && timing.rsi >= 46 && (timing.pivot.bullish || timing.pattern.bullish) && timing.relativeVolume >= .9;
  const pullback = aggressivePullbackCriteria(extension,d,four,two,one);
  const flexiblePullback = flexibleMacro && one.close >= one.ema51 && (one.recentLow <= one.ema9 * 1.02 || one.recentLow <= one.ema22 * 1.02) && (one.pivot.bullish || one.pattern.bullish) && two.close >= two.ema51 && (two.pivot.bullish || two.pattern.bullish || two.momentum) && (one.buyerDominance || one.relativeVolume >= .9) && one.previousSellerExhaustion !== false;
  if (!(strategy==='rsi-ema-recovery'||strategy==='ema-cross-retest-2h'||strategy==='compression-expansion-1h'||strategy==='vwap-retest-1h-2h'||(strategy === 'trend' ? trendValid : strategy === 'aggressive-pullback' ? pullback.valid : flexiblePullback))) return reject('Condições específicas do setup não confirmadas');
  if (!['ema-cross-retest-2h','compression-expansion-1h','rsi-ema-recovery','vwap-retest-1h-2h'].includes(strategy)&&lateEntry(timing,triggerSeries,triggerTimeframe)) return reject('Entrada esticada além do limite');
  let score = strategy==='rsi-ema-recovery' ? (recovery.touchCount>=2?92:90) : strategy==='ema-cross-retest-2h' ? 90 : strategy==='compression-expansion-1h'?85 : strategy==='vwap-retest-1h-2h'?84 : strategy === 'trend' ? 58 : 60;
  if (d.momentum) score += strategy === 'flexible-pullback-2h' ? 4 : 8;
  if (four.momentum) score += 10;
  if (two.momentum) score += 8;
  if (timing.pattern.bullish && strategy!=='rsi-ema-recovery') score += 7;
  if (timing.pivot.bullish && two.pivot.bullish) score += 8;
  if (timing.relativeVolume >= 1.25) score += 9;
  if (two.strong || timing.strong) score += 7;
  if (strategy==='compression-expansion-1h'&&early1h.rsiCross) score += 5;
  if (strategy==='vwap-retest-1h-2h'&&vwap.squeezeReleased) score += 5;
  if (strategy==='vwap-retest-1h-2h'&&vwap.cvdRising) score += 4;
  if ((strategy === 'aggressive-pullback' || strategy === 'flexible-pullback-2h') && timing.pivot.bullish) score += 8;
  score = Math.min(score,100);
  if (score < config.minScore) return reject(`Score ${score}, abaixo do mínimo ${config.minScore}`);
  const entry = timing.close, previousLow = Math.min(...triggerSeries.slice(-4,-1).map(c => c.low)), stopBase=strategy==='rsi-ema-recovery'?recovery.stopBase:strategy==='compression-expansion-1h'?Math.max(early1h.baseLow,triggerSeries.at(-1).low):previousLow, stop = stopBase - timing.atr * .12, risk = entry-stop, tp2 = entry+2*risk, tp3 = entry+3*risk;
  if (![entry,stop,risk,tp2,tp3].every(Number.isFinite) || risk <= 0) return reject('Risco ou níveis de entrada inválidos');
  const tickerPrice = Number(asset.price ?? asset.lastPrice);
  const latestPrice = Number.isFinite(tickerPrice) && tickerPrice > 0 ? tickerPrice : series?.['1h']?.at(-1)?.close ?? series?.['2h']?.at(-1)?.close ?? series?.['4h']?.at(-1)?.close;
  if (Number.isFinite(latestPrice) && latestPrice <= stop) return reject(`Sinal vencido: preço atual ${latestPrice.toFixed(8)} já rompeu o stop ${stop.toFixed(8)}`);
  if (Number.isFinite(latestPrice) && latestPrice >= tp2) return reject(`Sinal vencido: preço atual ${latestPrice.toFixed(8)} já atingiu o TP 2R ${tp2.toFixed(8)}`);
  const maxEntry=(tp2+config.minimumRewardRisk*stop)/(1+config.minimumRewardRisk);
  if (Number.isFinite(latestPrice)) { const progress = (latestPrice-entry)/Math.max(tp2-entry,Number.EPSILON); if (progress >= .5) return reject(`Entrada esticada: preço atual já percorreu ${(progress*100).toFixed(0)}% do caminho até o TP 2R`); if (latestPrice>maxEntry) return reject(`Entrada expirada: preço atual ${latestPrice.toFixed(8)} excede o limite ${maxEntry.toFixed(8)} para manter ${config.minimumRewardRisk.toFixed(1)}R`); }
  if (Number.isFinite(latestPrice) && config.maxEntryDeviationPct > 0) { const deviation = Math.abs(latestPrice/entry-1)*100; if (deviation > config.maxEntryDeviationPct) return reject(`Entrada distante do preço atual (${deviation.toFixed(1)}% acima do limite de ${config.maxEntryDeviationPct.toFixed(1)}%)`); }
  const riskPct=Math.abs(risk/entry), highRisk=riskPct>.04;
  if (riskPct > .08) return reject(`Stop muito distante (${(riskPct*100).toFixed(1)}%)`);
  if ((tp2-entry)/entry < .03) return reject('Alvo 2R abaixo do mínimo de 3%');
  if (!['compression-expansion-1h','rsi-ema-recovery'].includes(strategy)&&timing.levels.resistance && timing.levels.resistance-entry < 2*risk) return reject('Resistência não deixa espaço mínimo de 2R');
  const stretchPct = timing.ema9 ? (entry / timing.ema9 - 1) * 100 : 0, stretchWarning = stretchPct > 0 ? `Entrada esticada em ${stretchPct.toFixed(1)}% vs EMA9` : 'Entrada sem esticamento vs EMA9';
  const triggerLabel=strategy==='rsi-ema-recovery'?`RSI <= 30 · ${recovery.touchCount} toque(s) · EMA 8 acima de 22/80 após ${recovery.elapsedDays.toFixed(1)} dias`:strategy==='ema-cross-retest-2h'?'EMA 9 cruzou 22/52 · reteste com pavio confirmado · rompimento fechado':strategy==='compression-expansion-1h'?'Base comprimida · rompimento inicial com volume e RSI':strategy==='vwap-retest-1h-2h'?'VWAP semanal rompida · primeiro reteste com volume':(timing.pattern.bullish ? timing.pattern.name : timing.pivot.label);
  const context=strategy==='rsi-ema-recovery'?'Experimental: recuperação pós-sobrevenda; confirmar visualmente estrutura, volume e resistência antes de operar':strategy==='ema-cross-retest-2h'?'Macro LONG: 1W · 1D · 4H, com cruzamento/reteste em 2H':strategy==='compression-expansion-1h'?'Antecipação 1H: base comprimida, expansão com volume e RSI; diário/4H sem viés baixista':strategy==='vwap-retest-1h-2h'?'Experimental: rompimento e primeiro reteste da VWAP semanal; squeeze e CVD são confluências, não certeza':'Macro LONG confirmado: 1W · 1D · 4H · 2H · 1H';
  const entryLimitLabel=`Entrada válida até ${maxEntry.toFixed(8)} para preservar ${config.minimumRewardRisk.toFixed(1)}R`;
  return { ...asset, source:asset.source||'BINANCE', direction:'LONG', strategy, strategyName:STRATEGIES[strategy], setup:STRATEGIES[strategy], tier:strategy==='rsi-ema-recovery'||strategy==='vwap-retest-1h-2h'?'WATCH':score>=90?'VALIDATED':'WATCH', tierLabel:strategy==='rsi-ema-recovery'||strategy==='vwap-retest-1h-2h'?'EXPERIMENTAL · CONFIRME O GRÁFICO':score>=90?'ENTRADA VALIDADA':'SETUP FORTE · AGUARDAR CONFIRMAÇÃO', triggerTimeframe, triggerLabel:triggerTimeframe.toUpperCase(), timeframe:triggerTimeframe.toUpperCase(), score, entry, maxEntry, minimumRewardRisk:config.minimumRewardRisk, stop, tp2, tp3, target:tp2, candleTime:triggerSeries.at(-1).time, rsi:timing.rsi, adx:timing.adx, volumeRatio:strategy==='compression-expansion-1h'?early1h.volumeRatio:strategy==='vwap-retest-1h-2h'?vwap.volumeRatio:timing.relativeVolume, context, trigger:`${triggerLabel} · RSI ${timing.rsi.toFixed(1)} · volume ${(strategy==='compression-expansion-1h'?early1h.volumeRatio:strategy==='vwap-retest-1h-2h'?vwap.volumeRatio:timing.relativeVolume).toFixed(2)}x · ${stretchWarning}`, entryStretchPct:stretchPct, entryWarning:highRisk?'Risco acima de 4%; somente SPOT, sem alavancagem':entryLimitLabel, support:timing.levels.support, resistance:timing.levels.resistance, weeklyRise:extension.rise12, weeklyRsi:extension.weekly.rsi, rsiTouches:recovery?.touchCount, waitingDays:recovery?.elapsedDays, riskManagement:{breakevenAtR:1,runnerTrailAfterR:2,runnerTrail:'mínima dos dois últimos candles de 4H'}, institutional:{vwap:vwap?.vwap,squeezeReleased:vwap?.squeezeReleased||false,cvdProxyRising:vwap?.cvdRising||false,ema200Four:four.ema200,ema200Daily:d.ema200},lateEntryAllowed:false,riskPct, maxLeverage:config.enforceRiskPolicy?(highRisk?1:2):3, riskTier:config.enforceRiskPolicy?(highRisk?'HIGH_RISK_SPOT':'STANDARD_LEVERAGE_2X'):null, engineVersion:VERSION };
}
function evaluate(asset, series, options = DEFAULTS, diagnostics = null) {
  const config = settings(options), analyses = analyseSet(series);
  const volume=Number(asset.volume ?? asset.volume24h);
  if (!Number.isFinite(volume) || volume < config.minVolume) { if (diagnostics) diagnostics.push({strategy:'geral',reason:`Volume do par abaixo de US$ ${config.minVolume.toLocaleString('en-US')}`}); return null; }
  const strategies = config.strategies || (config.strategy === 'both' ? Object.keys(STRATEGIES) : [config.strategy]);
  const attempts = strategies.flatMap(strategy => {
    const timeframes=strategy==='rsi-ema-recovery'?['8h','4h','2h','1h']:strategy==='compression-expansion-1h'?['1h']:strategy==='vwap-retest-1h-2h'?['1h','2h']:strategy==='flexible-pullback-2h'||strategy==='ema-cross-retest-2h'||strategy==='double-oversold-bounce'?['2h']:['1h','2h','4h'];
    return timeframes.map(triggerTimeframe=>{const trace={strategy:`${strategy} · ${triggerTimeframe.toUpperCase()}`,reason:null};const signal=evaluateAnalyses(asset,series,analyses,strategy,config,triggerTimeframe,trace);if(diagnostics)diagnostics.push(trace);return signal;});
  });
  return attempts.filter(Boolean).sort(compareSignals)[0] || null;
}
function compareSignals(a,b) {
  const priority={trend:0,'aggressive-pullback':1,'flexible-pullback-2h':2,'ema-cross-retest-2h':3,'compression-expansion-1h':4,'vwap-retest-1h-2h':5,'double-oversold-bounce':6,'bearish-breakdown':7,'rsi-ema-recovery':99};
  return (priority[a.strategy]??99)-(priority[b.strategy]??99) || b.score-a.score || (a.rank||99999)-(b.rank||99999) || a.symbol.localeCompare(b.symbol);
}
function consolidate(signals, limit = 20) { const seen=new Set(); return signals.slice().sort(compareSignals).filter(s=>{if(seen.has(s.symbol))return false; seen.add(s.symbol); return true;}).slice(0,limit); }
function isFresh(signal, previous, now = Date.now()) {
  if (!previous) return true;
  // Um setup novo para o mesmo ativo deve ser comunicado: o histórico não pode
  // ocultar a recuperação RSI/EMA só porque outra estratégia já alertou a vela.
  if (previous.strategy && signal.strategy && previous.strategy !== signal.strategy) return true;
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
  const warnings=[], rankings={}, venueBooks=new Map();
  // O mesmo ativo é sempre lido integralmente em uma única corretora/par. USDT e
  // USDC permanecem preferenciais, mas pares em outras moedas passam a valer quando
  // seu volume puder ser convertido para USD pela própria corretora.
  function createVenueBook(source){return {source,byBase:new Map(),pairsByBase:new Map(),quoteUsd:new Map()};}
  function quoteRank(quote){const preferred=QUOTE_PRIORITY.indexOf(quote);return preferred>=0?preferred:STABLE_BASES.has(quote)?2:3;}
  function registerUsdQuote(book,base,quote,price){if(STABLE_BASES.has(quote)&&Number(price)>0)book.quoteUsd.set(base,Number(price));}
  function addVenuePair(book, base, quote, pair, volume, price, metadata={}) {
    base=String(base||'').toUpperCase();quote=String(quote||'').toUpperCase();
    if(!base||!quote||!pair)return;
    const quoteUsd=STABLE_BASES.has(quote)?1:Number(book.quoteUsd.get(quote)||0), rawVolume=Number(volume)||0, usdVolume=rawVolume*quoteUsd;
    if(!Number.isFinite(usdVolume)||usdVolume<=0)return;
    const candidate={source:book.source,base,quoteAsset:quote,exchangeSymbol:pair,volume:usdVolume,rawQuoteVolume:rawVolume,quoteUsdPrice:quoteUsd,price:Number(price)||0,metadata};
    const list=book.pairsByBase.get(base)||[];list.push(candidate);book.pairsByBase.set(base,list);
    const previous=book.byBase.get(base);
    if(!previous||quoteRank(candidate.quoteAsset)<quoteRank(previous.quoteAsset)||candidate.volume>previous.volume&&quoteRank(candidate.quoteAsset)===quoteRank(previous.quoteAsset))book.byBase.set(base,candidate);
  }
  function selectVenuePair(book,base,minVolume=0){const pairs=book?.pairsByBase.get(base)||[];return pairs.filter(pair=>pair.volume>=minVolume).sort((a,b)=>quoteRank(a.quoteAsset)-quoteRank(b.quoteAsset)||b.volume-a.volume)[0]||null;}
  async function loadBinance(){const [info,quotes]=await Promise.all([getJson(`${SOURCES.spot}/exchangeInfo`),getJson(`${SOURCES.spot}/ticker/24hr`)]);if(!Array.isArray(info.symbols)||!Array.isArray(quotes))throw new Error('Universo Binance inválido');const book=createVenueBook('BINANCE'),quoteMap=new Map(quotes.map(q=>[q.symbol,q])),valid=info.symbols.filter(p=>p.status==='TRADING'&&p.isSpotTradingAllowed!==false);for(const p of valid){const q=quoteMap.get(p.symbol)||{};registerUsdQuote(book,baseOf(p.baseAsset||p.symbol),String(p.quoteAsset||'').toUpperCase(),q.lastPrice);}for(const p of valid){const q=quoteMap.get(p.symbol)||{};addVenuePair(book,baseOf(p.baseAsset||p.symbol),p.quoteAsset,p.symbol,q.quoteVolume,q.lastPrice,p);}return book;}
  async function loadMexc(){const [info,quotes]=await Promise.all([getJson(`${SOURCES.mexc}/exchangeInfo`),getJson(`${SOURCES.mexc}/ticker/24hr`)]);if(!Array.isArray(info.symbols)||!Array.isArray(quotes))throw new Error('Universo MEXC inválido');const book=createVenueBook('MEXC'),quoteMap=new Map(quotes.map(q=>[q.symbol,q])),valid=info.symbols.filter(p=>p.status==='1'&&p.isSpotTradingAllowed!==false);for(const p of valid){const q=quoteMap.get(p.symbol)||{};registerUsdQuote(book,baseOf(p.baseAsset||p.baseCoin||p.symbol),String(p.quoteAsset||'').toUpperCase(),q.lastPrice);}for(const p of valid){const q=quoteMap.get(p.symbol)||{};addVenuePair(book,baseOf(p.baseAsset||p.baseCoin||p.symbol),p.quoteAsset,p.symbol,q.quoteVolume,q.lastPrice,p);}return book;}
  async function loadOkx(){const [info,tickerPayload]=await Promise.all([getJson(`${SOURCES.okx}/public/instruments?instType=SPOT`),getJson(`${SOURCES.okx}/market/tickers?instType=SPOT`)]);const instruments=info?.data,quotes=tickerPayload?.data;if(!Array.isArray(instruments)||!Array.isArray(quotes))throw new Error('Universo OKX inválido');const book=createVenueBook('OKX'),quoteMap=new Map(quotes.map(q=>[q.instId,q])),valid=instruments.filter(p=>p.state==='live');for(const p of valid){const q=quoteMap.get(p.instId)||{};registerUsdQuote(book,baseOf(p.baseCcy||p.instId),String(p.quoteCcy||'').toUpperCase(),q.last);}for(const p of valid){const q=quoteMap.get(p.instId)||{};addVenuePair(book,baseOf(p.baseCcy||p.instId),p.quoteCcy,p.instId,q.volCcy24h,q.last,p);}return book;}
  async function loadCoinbase(){const payload=await getJson(`${SOURCES.coinbase}/products?limit=1000`),products=Array.isArray(payload?.products)?payload.products:Array.isArray(payload)?payload:null;if(!products)throw new Error('Universo Coinbase inválido');const book=createVenueBook('COINBASE'),valid=products.filter(p=>!(p.trading_disabled||p.is_disabled));for(const p of valid){const quote=String(p.quote_currency_id||p.quote_currency||'').toUpperCase(),base=String(p.base_currency_id||p.base_currency||'').toUpperCase();registerUsdQuote(book,base,quote,p.price);}for(const p of valid){const quote=String(p.quote_currency_id||p.quote_currency||'').toUpperCase(),base=String(p.base_currency_id||p.base_currency||'').toUpperCase(),pair=p.product_id;addVenuePair(book,base,quote,pair,p.approximate_quote_24h_volume||p.quote_volume_24h,p.price,p);}return book;}
  const venueSettled=await Promise.allSettled([loadBinance(),loadOkx(),loadMexc(),loadCoinbase()]);
  venueSettled.forEach((result,index)=>{const venue=VENUE_PRIORITY[index];if(result.status==='fulfilled')venueBooks.set(venue,result.value);else warnings.push(`${venue}: ${result.reason.message}`);});
  if(!venueBooks.has('BINANCE'))warnings.push('Binance indisponível: o regime BTC e derivativos continuam em modo de proteção.');
  function selectVenue(base,minVolume=0){for(const venue of VENUE_PRIORITY){const pair=selectVenuePair(venueBooks.get(venue),base,minVolume);if(pair)return pair;}return null;}
  const primaryJobs=[['CoinGecko',async()=>{const rows=[];for(let page=1;page<=Math.ceil(config.assetLimit/250);page++){const coins=await getJson(`${SOURCES.ranking}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false`);if(!Array.isArray(coins)||!coins.length)throw new Error('Ranking indisponível');rows.push(...coins);}return rows.map(c=>({...c,rank:Number(c.market_cap_rank)}));}],['CoinMarketCap',async()=>{const result=await getJson(`${SOURCES.cmc}/cryptocurrency/listings/latest?start=1&limit=${config.assetLimit}&convert=USD&sort=market_cap&sort_dir=desc`);if(!Array.isArray(result.data)||(result.status?.error_code != null && Number(result.status.error_code)!==0))throw new Error(result.status?.error_message||'Ranking inválido');return result.data.map(c=>({...c,rank:Number(c.cmc_rank)}));}]];
  let jobs=primaryJobs, settled=await Promise.allSettled(primaryJobs.map(([,load])=>load()));
  if(!settled.some(result=>result.status==='fulfilled')){
    jobs=[['CoinPaprika',async()=>{const rows=await getJson(`${SOURCES.paprika}/tickers?quotes=USD`);if(!Array.isArray(rows)||!rows.length)throw new Error('Ranking indisponível');return rows.map(c=>({symbol:c.symbol,name:c.name,rank:Number(c.rank)})).filter(c=>Number.isInteger(c.rank)&&c.rank>0).sort((a,b)=>a.rank-b.rank).slice(0,config.assetLimit);}]];
    settled=await Promise.allSettled(jobs.map(([,load])=>load()));
  }
  const merged=new Map();
  settled.forEach((result,index)=>{
    const source=jobs[index][0];
    if(result.status==='rejected'){warnings.push(`${source}: ${result.reason.message}`);return;}
    const rows=result.value.filter(c=>Number.isInteger(c.rank)&&c.rank>=1&&c.rank<=config.assetLimit&&/^[a-z0-9]+$/i.test(c.symbol||''));
    if(!rows.length){warnings.push(`${source}: ranking sem ativos válidos`);return;}
    rankings[source]=rows.length;
    const symbols=new Map();for(const c of rows){const symbol=String(c.symbol).toUpperCase();symbols.set(symbol,(symbols.get(symbol)||0)+1);}
    for(const c of rows){const base=baseOf(c.symbol),symbol=canonicalSymbol(base);if(symbols.get(base)>1){if(selectVenue(base))warnings.push(`${source}: símbolo ambíguo ${symbol}, ignorado nessa fonte`);continue;}const old=merged.get(symbol)||{symbol,base,name:c.name,rank:c.rank,rankingSources:[],rankings:{}};const marketCap=Number(c.market_cap||c.quote?.USD?.market_cap||0);old.rank=Math.min(old.rank,c.rank);old.marketCap=Math.max(Number(old.marketCap)||0,Number.isFinite(marketCap)?marketCap:0);old.rankingSources.push(source);old.rankings[source]=c.rank;merged.set(symbol,old);}
  });
  const sources=Object.keys(rankings);
  let mode, candidates;
  if(!sources.length){
    // Contingência: os rankings por capitalização podem bloquear consultas públicas.
    // Mantemos o scanner operacional ordenando os pares Binance por volume USDT 24h.
    warnings.push('Rankings por capitalização indisponíveis; usando ranking fallback por volume 24h da Binance.');
    const fallback=[...(venueBooks.get('BINANCE')?.byBase||new Map()).values()].filter(pair=>!['BTC','ETH'].includes(pair.base)&&!isStableAsset(pair.base)&&pair.volume>=config.minVolume).sort((a,b)=>b.volume-a.volume).slice(0,config.assetLimit);
    candidates=fallback.map((pair,index)=>({symbol:canonicalSymbol(pair.base),base:pair.base,name:pair.base,rank:index+1,rankingSources:['Binance volume 24h'],rankings:{'Binance volume 24h':index+1},volume:pair.volume,volume24h:pair.volume}));
    mode='volume 24h Binance (fallback)';
  } else { mode=`market cap (${sources.join(' + ')})`; candidates=[...merged.values()]; }
  const candidateAudit=candidates.map(c=>{const base=c.base||baseOf(c.symbol),available=selectVenue(base),pair=selectVenue(base,config.minVolume),stable=isStableAsset(base),tradfi=isTradfiTokenized({...c,...(available?.metadata||{})}),tradfiAllowed=tradfi&&config.allowMexcTradfi&&available?.source==='MEXC'&&isUsRegularMarketSession(config.asOf||Date.now()),source=pair?.source||available?.source,volume=available?.volume||0;return {symbol:c.symbol,name:c.name,rank:c.rank,source,quoteAsset:pair?.quoteAsset||available?.quoteAsset,exchangeSymbol:pair?.exchangeSymbol||available?.exchangeSymbol,volume,tokenized:tradfi,assetClass:tradfi?'TRADFI_TOKENIZED':'CRYPTO',status:pair&&!stable&&(!tradfi||tradfiAllowed)?'eligible':'excluded',reason:stable?'Stablecoin excluída do scanner':tradfi&&!config.allowMexcTradfi?'Ativo tradicional tokenizado desativado na configuração':tradfi&&available?.source!=='MEXC'?'Ativo tradicional tokenizado permitido apenas no spot MEXC':tradfi&&!isUsRegularMarketSession(config.asOf||Date.now())?'Ativo tradicional tokenizado fora do pregão regular dos EUA':!available?'Par com volume conversível para USD não encontrado nas corretoras configuradas':`Volume ${volume.toLocaleString('en-US',{maximumFractionDigits:0})} abaixo do mínimo de US$ ${config.minVolume.toLocaleString('en-US')}`};});
  const seen=new Set();
  const assets=candidates.map(c=>{const pair=selectVenue(c.base||baseOf(c.symbol),config.minVolume),available=selectVenue(c.base||baseOf(c.symbol)),tradfi=isTradfiTokenized({...c,...(available?.metadata||{})});if(!pair||tradfi&&(!config.allowMexcTradfi||pair.source!=='MEXC'||!isUsRegularMarketSession(config.asOf||Date.now())))return null;return {...c,source:pair.source,exchangeSymbol:pair.exchangeSymbol,quoteAsset:pair.quoteAsset,volume:pair.volume,volume24h:pair.volume,price:pair.price,lastPrice:pair.price,tokenized:tradfi,assetClass:tradfi?'TRADFI_TOKENIZED':'CRYPTO'};}).filter(a=>a&&!['BTCUSDT','ETHUSDT'].includes(a.symbol)&&!isStableAsset(a.base||a.symbol)&&(!a.tokenized||a.source==='MEXC')&&!seen.has(a.symbol)&&(seen.add(a.symbol),true)).sort((a,b)=>a.rank-b.rank||a.symbol.localeCompare(b.symbol));
  return {assets,mode,warnings,rankings,requestedLimit:config.assetLimit,rankingCandidates:candidates.length,candidateAudit};
}
function venueFromSource(source) {
  if(source==='BINANCE'||source===SOURCES.spot)return 'BINANCE';
  if(source==='MEXC'||source===SOURCES.mexc)return 'MEXC';
  if(source==='OKX'||source===SOURCES.okx)return 'OKX';
  if(source==='COINBASE'||source===SOURCES.coinbase)return 'COINBASE';
  return 'BINANCE';
}
function intervalMs(interval){return ({'1h':3600000,'2h':7200000,'4h':14400000,'1d':86400000,'1w':604800000})[interval]||3600000;}
function normaliseVenueCandles(raw,venue,interval,asOf){
  if(venue==='BINANCE'||venue==='MEXC')return closedCandles(raw,asOf);
  if(venue==='OKX'){const rows=Array.isArray(raw?.data)?raw.data:[];return rows.map(row=>({time:+row[0],closeTime:+row[0]+intervalMs(interval)-1,open:+row[1],high:+row[2],low:+row[3],close:+row[4],volume:+row[5],takerBuyVolume:null,confirmed:String(row[8]??'1')})).filter(c=>c.confirmed==='1'&&c.closeTime<asOf&&[c.time,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)).sort((a,b)=>a.time-b.time);}
  const rows=Array.isArray(raw?.candles)?raw.candles:Array.isArray(raw)?raw:[];return rows.map(row=>({time:Number(row.start??row.start_time)*1000,open:+row.open,high:+row.high,low:+row.low,close:+row.close,volume:+row.volume,takerBuyVolume:null})).map(c=>({...c,closeTime:c.time+intervalMs(interval)-1})).filter(c=>c.closeTime<asOf&&[c.time,c.closeTime,c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}
async function fetchSeries(getJson,symbol,asOf,source=SOURCES.spot,hourlyLimit=210) {
  const limitFor=interval=>interval==='1h'?hourlyLimit:210;
  const venue=venueFromSource(source);
  if(venue==='MEXC'){
    // A API spot da MEXC não oferece candle 2H nativo e exige start/end juntos
    // quando a janela é informada. Buscamos os candles fechados mais recentes e
    // agregamos 1H em 2H localmente, preservando a mesma regra do motor.
    const intervals={'1w':'1W','1d':'1d','4h':'4h','1h':'1h'};
    const native=Object.fromEntries(await Promise.all(Object.entries(intervals).map(async([interval,mexcInterval])=>{
      const raw=await getJson(`${SOURCES.mexc}/klines?symbol=${encodeURIComponent(symbol)}&interval=${mexcInterval}&limit=${limitFor(interval)}`);
      return [interval,closedCandles(raw,asOf)];
    })));
    return {...native,'2h':resampleHourly(native['1h'],2)};
  }
  if(venue==='OKX'){
    const bars={'1w':'1Wutc','1d':'1Dutc','4h':'4Hutc','2h':'2Hutc','1h':'1Hutc'};
    const values=await Promise.all(INTERVALS.map(interval=>getJson(`${SOURCES.okx}/market/candles?instId=${encodeURIComponent(symbol)}&bar=${bars[interval]}&limit=${limitFor(interval)}`).then(raw=>normaliseVenueCandles(raw,'OKX',interval,asOf))));
    return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
  }
  if(venue==='COINBASE'){
    const grains={'1w':'ONE_WEEK','1d':'ONE_DAY','4h':'FOUR_HOUR','2h':'TWO_HOUR','1h':'ONE_HOUR'};
    const start=Math.floor((asOf-intervalMs('1w')*Math.max(210,Math.ceil(hourlyLimit/168)))/1000), end=Math.floor(asOf/1000);
    const values=await Promise.all(INTERVALS.map(interval=>getJson(`${SOURCES.coinbase}/products/${encodeURIComponent(symbol)}/candles?start=${start}&end=${end}&granularity=${grains[interval]}`).then(raw=>normaliseVenueCandles(raw,'COINBASE',interval,asOf))));
    return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
  }
  const values=await Promise.all(INTERVALS.map(interval=>getJson(`${source}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limitFor(interval)}&endTime=${asOf-1}`).then(raw=>closedCandles(raw,asOf))));
  return Object.fromEntries(INTERVALS.map((interval,i)=>[interval,values[i]]));
}
async function vehicle(getJson,signal,asOf) {
  const spot={...signal,vehicle:'SPOT',leverage:'1×',vehicleReason:`Setup SPOT confirmado na ${signal.source||'BINANCE'}.`};
  if (signal.riskTier==='HIGH_RISK_SPOT') return {...spot,vehicleReason:'Risco entre 4% e 8%; somente SPOT, sem alavancagem.'};
  // Dados de preço de outra corretora não autorizam automaticamente um futuro
  // Binance: o alerta permanece SPOT para não misturar mercados na execução.
  if(signal.source!=='BINANCE') return spot;
  if (signal.direction==='SHORT') return {...signal,vehicle:'FUTURES BINANCE',leverage:'2× máx.',vehicleReason:'Direção SHORT: confirme contrato Binance, liquidez e margem antes de operar.'};
  const derivatives=signal.derivatives;
  if(!derivatives){try{const metrics=await fetchBinanceDerivatives(getJson,signal.symbol),gate=derivativesGate(metrics);if(gate.blocked)return {...spot,vehicleReason:gate.reason};if(!gate.available)return {...spot,vehicleReason:'Setup SPOT confirmado; contrato perpétuo Binance sem dados suficientes para liberar futuros.',vehicleWarning:metrics.warning};return vehicle(getJson,{...signal,derivatives:{...metrics,...gate}},asOf);}catch(error){return {...spot,vehicleReason:'Setup SPOT confirmado; consulta de futuros Binance indisponível.',vehicleWarning:error.message};}}
  if(!derivatives.available || derivatives.blocked)return {...spot,vehicleReason:'Setup SPOT confirmado; contrato perpétuo Binance sem dados suficientes para liberar futuros.'};
  const leverageCap=Math.min(2,signal.maxLeverage||2), fundingPct=(derivatives.funding*100).toFixed(3);
  return {...signal,vehicle:'FUTURES BINANCE',leverage:`${leverageCap}× máx.`,funding:derivatives.funding,vehicleReason:`Perpétuo Binance disponível; funding ${fundingPct}% por período${derivatives.institutional?' e OI 4H crescente':''}.`};
}
function normalizeFundingRate(value) { if(value==null||value==='')return null; const rate=Number(value); if(!Number.isFinite(rate)) return null; return Math.abs(rate)>0.1?rate/100:rate; }
function derivativesGate(metrics = {}) {
  const funding=normalizeFundingRate(metrics.funding), oiIncreasing4h=metrics.oiIncreasing4h===true, euphoric=Number.isFinite(funding)&&funding>.0005, institutional=Number.isFinite(funding)&&funding>=-.0001&&funding<=.0001&&oiIncreasing4h;
  return {available:Number.isFinite(funding),funding,euphoric,blocked:euphoric,oiIncreasing4h,institutional,scoreBonus:institutional?5:0,reason:euphoric?'Funding Binance acima de +0,05% por 8h; risco de long squeeze':institutional?'Funding neutro/levemente negativo e OI 4H crescente (+5)':'Métricas derivativas sem confluência adicional'};
}
async function fetchBinanceDerivatives(getJson,symbol) {
  try {
    const ticker=await getJson(`${SOURCES.futures}/premiumIndex?symbol=${encodeURIComponent(symbol)}`), funding=normalizeFundingRate(ticker?.lastFundingRate);
    let oiIncreasing4h=false;
    try { const rows=await getJson(`${SOURCES.futuresData}/openInterestHist?symbol=${encodeURIComponent(symbol)}&period=4h&limit=2`); if(Array.isArray(rows)&&rows.length>=2){const first=Number(rows.at(-2)?.sumOpenInterestValue??rows.at(-2)?.sumOpenInterest), last=Number(rows.at(-1)?.sumOpenInterestValue??rows.at(-1)?.sumOpenInterest); oiIncreasing4h=Number.isFinite(first)&&Number.isFinite(last)&&last>first;} } catch { /* OI histórico é opcional; funding continua sendo aplicado. */ }
    return {contract:symbol,funding,oiIncreasing4h};
  } catch(error) { return {contract:symbol,funding:null,oiIncreasing4h:false,warning:error.message}; }
}
async function scanMarket(getJson,options=DEFAULTS,onProgress=()=>{}) {
  const config=settings(options), clock=await getJson(`${SOURCES.spot}/time`), asOf=Number(clock.serverTime);
  if(!Number.isFinite(asOf))throw new Error('Horário Binance inválido.');
  const universe=await marketUniverse(getJson,{...config,asOf}), signals=[], failures=[], diagnostics=universe.candidateAudit.filter(item=>item.status==='excluded').map(item=>({...item,reasons:[item.reason]})), warnings=[...universe.warnings];let next=0,done=0;
  let marketRegime={available:false,vetoLongs:false,status:'UNAVAILABLE',label:'Regime BTC indisponível'};
  try { const btc=analyseSet(await fetchSeries(getJson,'BTCUSDT',asOf,SOURCES.spot)); marketRegime=marketRegimeGate(btc); if(marketRegime.vetoLongs)warnings.push(marketRegime.label); }
  catch(error){ warnings.push(`Regime BTC indisponível: ${error.message}`); }
  const needsRecovery=(config.strategies||[config.strategy]).includes('rsi-ema-recovery')||config.strategy==='both';
  async function worker(){while(next<universe.assets.length){const asset=universe.assets[next++];const audit={symbol:asset.symbol,name:asset.name,rank:asset.rank,source:asset.source,quoteAsset:asset.quoteAsset,exchangeSymbol:asset.exchangeSymbol,volume:asset.volume,status:'rejected',reasons:[]};try{const source=sourceForAsset(asset),series=await fetchSeries(getJson,asset.exchangeSymbol||asset.symbol,asOf,source,needsRecovery?800:210), trace=[], signal=evaluate(asset,series,config,trace);audit.reasons=trace.filter(item=>item.reason).map(item=>`${item.strategy}: ${item.reason}`);if(signal&&marketRegime.vetoLongs&&signal.direction==='LONG'){audit.reasons=[marketRegime.label];}else if(signal){signals.push(signal);audit.status='signal';audit.score=signal.score;audit.strategy=signal.strategyName;}else if(!audit.reasons.length)audit.reasons=['Não atingiu todos os filtros do setup'];}catch(error){failures.push({symbol:asset.symbol,source:asset.source,exchangeSymbol:asset.exchangeSymbol,error:error.message});audit.status='error';audit.reasons=[`Falha de consulta: ${error.message}`];}diagnostics.push(audit);onProgress(++done,universe.assets.length);}}
  await Promise.all(Array.from({length:Math.min(4,universe.assets.length)},worker));
  if(universe.assets.length && failures.length===universe.assets.length)throw new Error(`Todas as ${failures.length} consultas de ativos falharam: ${failures[0].error}`);
  const qualified=consolidate(signals,config.maxSignals), selected=[];
  for(const signal of qualified){const derivatives=signal.direction==='LONG'?await fetchBinanceDerivatives(getJson,signal.symbol):null, gate=derivatives?derivativesGate(derivatives):null;if(gate?.blocked){const audit=diagnostics.find(item=>item.symbol===signal.symbol&&item.status==='signal');if(audit){audit.status='rejected';audit.reasons=[gate.reason];}continue;}const enriched=gate?{...signal,score:Math.min(100,signal.score+gate.scoreBonus),derivatives:{...derivatives,...gate}}:signal,checked=await vehicle(getJson,enriched,asOf);selected.push(checked);if(checked.vehicleWarning)warnings.push(`${signal.symbol}: ${checked.vehicleWarning}`);if(derivatives?.warning)warnings.push(`${signal.symbol}: derivativos Binance indisponíveis (${derivatives.warning})`);}
  return {signals:selected,assets:universe.assets.length,eligibleAssets:universe.assets.length,requestedLimit:universe.requestedLimit,rankingCandidates:universe.rankingCandidates,diagnostics,mode:universe.mode,failures,warnings,marketRegime,asOf,config,engineVersion:VERSION};
}

return Object.freeze({last,sma,ema,rsi,atr,macd,adx,stochRsi,candlePattern,bullishPivot,supportResistance,weeklyExtension,analyseTimeframe,lateEntry,pullbackStochCriteria,aggressivePullbackCriteria,pullback1hConfirmationCriteria,compressionExpansion1hCriteria,resampleHourly,anchoredWeeklyVwap,bollingerKeltner,cvdProxy,vwapRetestCriteria,rsiEmaRecoveryCriteria,marketRegimeGate,normalizeFundingRate,derivativesGate,fetchBinanceDerivatives,VERSION,SOURCES,DEFAULTS,STRATEGIES,VENUE_PRIORITY,QUOTE_PRIORITY,baseOf,canonicalSymbol,sourceForAsset,sourceLabel,settings,closedCandles,confirmedMacro,analyseSet,evaluateAnalyses,evaluate,compareSignals,consolidate,isFresh,rankingLabel,isTradfiTokenized,marketUniverse,fetchSeries,vehicle,scanMarket});
});

