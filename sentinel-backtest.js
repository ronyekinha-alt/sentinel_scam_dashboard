/* Mesmos setups históricos no navegador e no Node; experimentais somente em simulação. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./sentinel-core.js'));else root.SentinelBacktest=factory(root.SentinelCore);})(typeof window!=='undefined'?window:globalThis,function(SentinelCore){
'use strict';
const { last,sma,ema,rsi,atr,macd,adx,stochRsi,candlePattern,bullishPivot,supportResistance,weeklyExtension,analyseTimeframe,lateEntry,pullbackStochCriteria,aggressivePullbackCriteria,pullback1hConfirmationCriteria }=SentinelCore;
function historyUntil(series, timestamp) { const index = series.findLastIndex(c => (c.closeTime ?? c.time) <= timestamp); return index < 209 ? null : series.slice(Math.max(0, index - 209), index + 1); }
function ema80BreakoutCriteria(candles, timing, emaCandles = candles) {
  if (candles.length < 85) return { valid: false };
  const closes = candles.map(c => c.close), emaCloses = emaCandles.map(c => c.close), e80 = ema(emaCloses, 80), mc = macd(closes), i = candles.length - 1, emaIndex = emaCloses.length - 1;
  const previousHigh = Math.max(...candles.slice(-5, -1).map(c => c.high));
  const hist = mc.histogram[i] || 0, previousHist = mc.histogram[i - 1] || 0;
  const breakoutSize = (timing.close / previousHigh - 1) * 100;
  const resistanceRoom = !timing.levels.resistance || (timing.levels.resistance / timing.close - 1) >= 0.05;
  const valid = timing.close > previousHigh && breakoutSize <= 3.5 && timing.close > e80[emaIndex] && e80[emaIndex] > e80[Math.max(0, emaIndex - 3)] && timing.rsi >= 48 && timing.rsi <= 72 && timing.relativeVolume >= 1 && timing.relativeVolume <= 2.5 && (mc.line[i] || 0) > 0 && hist > 0 && hist > previousHist && resistanceRoom;
  return { valid, previousHigh, breakoutSize, resistanceRoom };
}
function expansionRetestCriteria(candles, timing) {
  if (candles.length < 60) return { valid: false };
  const rangeCandles = candles.slice(-25, -5), recent = candles.slice(-5, -1);
  const rangeHigh = Math.max(...rangeCandles.map(candle => candle.high));
  const averageVolume = candles.slice(-25, -5).reduce((sum, candle) => sum + Number(candle.volume || 0), 0) / 20;
  const breakout = recent.some(candle => candle.close > rangeHigh && Number(candle.volume || 0) >= averageVolume * 1.35);
  const latest = candles.at(-1), retest = latest.low <= rangeHigh * 1.012 && timing.close >= rangeHigh * .995 && latest.close >= latest.open;
  const aligned = timing.close >= timing.ema9 && timing.ema9 >= timing.ema22 && timing.ema22 >= timing.ema51;
  const valid = breakout && retest && aligned && timing.rsi >= 52 && timing.rsi <= 78 && timing.relativeVolume >= 1.05;
  return { valid, rangeHigh, breakout, retest, aligned };
}
function refinedEarlyEmaRsiCriteria(candles, timing, confirmation, day, four) {
  const closes = candles.map(c => c.close), e9 = ema(closes, 9), e22 = ema(closes, 22), i = closes.length - 1;
  const crossedRecently = Array.from({ length: Math.min(8, i - 1) }, (_, offset) => i - offset).some(index => e9[index - 1] <= e22[index - 1] && e9[index] > e22[index]);
  const bullishStructure = timing.close > timing.ema22 && timing.ema22 > timing.ema51;
  const retest = timing.recentLow <= timing.ema22 * 1.025 || timing.recentLow <= timing.ema9 * 1.02;
  const supportDistance = timing.levels.support ? (timing.close - timing.levels.support) / timing.close : 0;
  const supportValid = supportDistance <= .08;
  const healthyRsi = timing.rsi >= 50 && timing.rsi <= 65 && day.rsi >= 48 && four.rsi >= 48;
  const confirmed = confirmation.close >= confirmation.ema22 && confirmation.rising && confirmation.rsi >= 48 && (confirmation.momentum || confirmation.pattern.bullish || confirmation.pivot.bullish);
  const valid = crossedRecently && bullishStructure && retest && supportValid && healthyRsi && confirmed && (timing.pattern.bullish || timing.pivot.bullish);
  return { valid, crossedRecently, retest, supportValid, healthyRsi, confirmed };
}
function refinedModerateEmaRsiCriteria(candles, timing, confirmation, day, four) {
  const closes = candles.map(c => c.close), e9 = ema(closes, 9), e22 = ema(closes, 22), i = closes.length - 1;
  const crossedRecently = Array.from({ length: Math.min(12, i - 1) }, (_, offset) => i - offset).some(index => e9[index - 1] <= e22[index - 1] && e9[index] > e22[index]);
  const bullishStructure = timing.close > timing.ema22 && timing.ema22 > timing.ema51;
  const retest = timing.recentLow <= timing.ema22 * 1.035 || timing.recentLow <= timing.ema9 * 1.025;
  const supportDistance = timing.levels.support ? (timing.close - timing.levels.support) / timing.close : 0;
  const supportValid = supportDistance <= .08;
  const healthyRsi = timing.rsi >= 48 && timing.rsi <= 68 && day.rsi >= 46 && four.rsi >= 46;
  const confirmed = confirmation.close >= confirmation.ema22 && confirmation.rising && confirmation.rsi >= 46 && (confirmation.momentum || confirmation.pattern.bullish || confirmation.pivot.bullish);
  const valid = crossedRecently && bullishStructure && retest && supportValid && healthyRsi && confirmed && (timing.pattern.bullish || timing.pivot.bullish);
  return { valid, crossedRecently, retest, supportValid, healthyRsi, confirmed };
}
function refinedIntermediateEmaRsiCriteria(candles, timing, confirmation, day, four) {
  const closes = candles.map(c => c.close), e9 = ema(closes, 9), e22 = ema(closes, 22), i = closes.length - 1;
  const crossedRecently = Array.from({ length: Math.min(8, i - 1) }, (_, offset) => i - offset).some(index => e9[index - 1] <= e22[index - 1] && e9[index] > e22[index]);
  const bullishStructure = timing.close > timing.ema22 && timing.ema22 > timing.ema51;
  const retest = timing.recentLow <= timing.ema22 * 1.03 || timing.recentLow <= timing.ema9 * 1.0225;
  const supportDistance = timing.levels.support ? (timing.close - timing.levels.support) / timing.close : 0;
  const supportValid = supportDistance <= .08;
  const healthyRsi = timing.rsi >= 48 && timing.rsi <= 67 && day.rsi >= 47 && four.rsi >= 47;
  const confirmed = confirmation.close >= confirmation.ema22 && confirmation.rising && confirmation.rsi >= 47 && (confirmation.momentum || confirmation.pattern.bullish || confirmation.pivot.bullish);
  const valid = crossedRecently && bullishStructure && retest && supportValid && healthyRsi && confirmed && (timing.pattern.bullish || timing.pivot.bullish);
  return { valid, crossedRecently, retest, supportValid, healthyRsi, confirmed };
}
function breakout30EmaCriteria(candles, timing, mode = 'close', lookback = 30) {
  if (candles.length < 40) return { valid: false };
  const rangeHigh = Math.max(...candles.slice(-(lookback + 1), -1).map(c => c.high));
  const alignment = timing.ema22 > timing.ema51 && timing.ema51 > timing.ema80;
  const volumeOk = timing.relativeVolume >= 1.15;
  const rsiOk = timing.rsi >= 52 && timing.rsi <= 72;
  const breakoutSize = (timing.close / rangeHigh - 1) * 100;
  let valid = false;
  const latest = candles.at(-1);
  if (mode === 'close') valid = timing.close > rangeHigh && breakoutSize <= 4 && latest.close >= latest.open && volumeOk;
  else {
    const recent = candles.slice(-8, -1);
    const retest = recent.some((c, index) => {
      const prior = candles.slice(Math.max(0, candles.length - 31 - (7 - index)), candles.length - 1 - (7 - index));
      const level = prior.length ? Math.max(...prior.map(x => x.high)) : rangeHigh;
      return c.close > level;
    });
    valid = retest && latest.low <= rangeHigh * 1.02 && timing.close > rangeHigh * .995 && latest.close >= latest.open && volumeOk;
  }
  return { valid: valid && alignment && rsiOk, rangeHigh, alignment, volumeOk, rsiOk, breakoutSize };
}
function historicalSetup(week, day, h4, h2, h1, strategy, triggerTimeframe = '1h', emaCandles = h1, options = {}) {
  if (['trend','aggressive-pullback'].includes(strategy)) {
    const series={'1w':week,'1d':day,'4h':h4,'2h':h2,'1h':h1};
    const signal=SentinelCore.evaluateAnalyses({symbol:'BACKTEST',volume:1000000},series,SentinelCore.analyseSet(series),strategy,{minScore:options.minScore||90},triggerTimeframe);
    return signal ? {entry:signal.entry,stop:signal.stop,target:signal.tp2,score:signal.score} : null;
  }
  const w = weeklyExtension(week), d = analyseTimeframe(day), four = analyseTimeframe(h4), two = analyseTimeframe(h2), one = analyseTimeframe(h1), pullback = pullbackStochCriteria(w, d, two, one), aggressive = aggressivePullbackCriteria(w, d, four, two, one);
  const alignedEmaCandles = emaCandles.filter(candle => candle.time <= h1.at(-1).time);
  const breakout = ema80BreakoutCriteria(h1, one, alignedEmaCandles.length >= 85 ? alignedEmaCandles : h1);
  const trendValid = !w.blocked && w.weekly.close >= w.weekly.ema22 && d.close >= d.ema51 && d.rsi >= 48 && four.close >= four.ema51 && two.close >= two.ema51 && one.close >= one.ema51 && one.rsi >= 46 && (one.pivot.bullish || one.pattern.bullish) && one.relativeVolume >= .9;
  const breakoutMacro = !w.blocked && d.close >= d.ema51 && four.close >= four.ema80 && four.rising;
  const earlyBreakout = ema80BreakoutCriteria(h1, one, alignedEmaCandles.length >= 85 ? alignedEmaCandles : h1);
  const earlyBreakoutMacro = !w.blocked && d.close >= d.ema51 && four.close >= four.ema80 && four.rising && four.rsi >= 50;
  const pullback1h4h = pullback1hConfirmationCriteria(w, d, four, one), pullback1h2h = pullback1hConfirmationCriteria(w, d, two, one);
  const legacyPullback = pullback1hConfirmationCriteria(w, d, triggerTimeframe === '4h' ? four : two, one);
  const expansionRetest = expansionRetestCriteria(h1, one);
  const refinedConfirmation = triggerTimeframe === '1h' ? two : triggerTimeframe === '2h' ? four : day;
  const refinedTiming = triggerTimeframe === '1h' ? one : triggerTimeframe === '2h' ? two : four;
  const refinedEarly = refinedEarlyEmaRsiCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, refinedConfirmation, d, four);
  const refinedModerate = refinedModerateEmaRsiCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, refinedConfirmation, d, four);
  const refinedIntermediate = refinedIntermediateEmaRsiCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, refinedConfirmation, d, four);
  const breakout30Close = breakout30EmaCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, 'close');
  const breakout30Retest = breakout30EmaCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, 'retest');
  const breakout60Close = breakout30EmaCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, 'close', 60);
  const breakout60Retest = breakout30EmaCriteria(triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, refinedTiming, 'retest', 60);
  const valid = strategy === 'stoch-pullback' ? pullback.valid : strategy === 'aggressive-pullback' ? aggressive.valid : strategy === 'expansion-retest-2h' ? triggerTimeframe === '2h' && expansionRetest.valid && breakoutMacro : strategy === 'legacy-pullback-1h' ? legacyPullback.valid : strategy === 'refined-early-ema-rsi' ? refinedEarly.valid : strategy === 'refined-moderate-ema-rsi' ? refinedModerate.valid : strategy === 'refined-intermediate-ema-rsi' ? refinedIntermediate.valid : strategy === 'breakout-30-2h-close' ? triggerTimeframe === '2h' && breakout30Close.valid : ['breakout-30-2h-retest', 'breakout-30-2h-retest-fixed-3', 'breakout-30-2h-retest-fixed-4', 'breakout-30-2h-retest-fixed-7'].includes(strategy) ? triggerTimeframe === '2h' && breakout30Retest.valid : strategy === 'breakout-60-2h-close' ? triggerTimeframe === '2h' && breakout60Close.valid : ['breakout-60-2h-retest', 'breakout-60-2h-retest-fixed-3', 'breakout-60-2h-retest-fixed-4', 'breakout-60-2h-retest-fixed-7'].includes(strategy) ? triggerTimeframe === '2h' && breakout60Retest.valid : strategy === 'pullback-1h-confirm-4h' ? pullback1h4h.valid : strategy === 'pullback-1h-confirm-2h' ? pullback1h2h.valid : strategy === 'ema80-breakout' ? breakout.valid && breakoutMacro : strategy === 'early-breakout-2h-4h' ? triggerTimeframe === '2h' && earlyBreakout.valid && earlyBreakoutMacro : trendValid;
  const intervalMs = h1.length > 1 ? h1.at(-1).time - h1.at(-2).time : 3600000, inferredTriggerTimeframe = intervalMs >= 3 * 3600000 ? '4h' : intervalMs >= 90 * 60000 ? '2h' : '1h';
  const anticipationConfirmed = inferredTriggerTimeframe !== '1h' || (two.aligned && two.rising && four.aligned && four.rising && one.momentum && one.relativeVolume >= 1);
  if ((strategy === 'pullback-1h-confirm-4h' || strategy === 'pullback-1h-confirm-2h') && triggerTimeframe !== '1h') return null;
  if (!valid || (strategy !== 'ema80-breakout' && strategy !== 'expansion-retest-2h' && !anticipationConfirmed)) return null;
  const triggerCandles = triggerTimeframe === '1h' ? h1 : triggerTimeframe === '2h' ? h2 : h4, triggerTiming = triggerTimeframe === '1h' ? one : triggerTimeframe === '2h' ? two : four;
  const entry = triggerTiming.close, previousCandles = triggerCandles.slice(-4, -1), previousThreeLow = previousCandles.length ? Math.min(...previousCandles.map(candle => candle.low)) : triggerTiming.levels.support, stop = previousThreeLow - .12 * triggerTiming.atr, fixedTargetPct = ['breakout-30-2h-retest-fixed-3', 'breakout-60-2h-retest-fixed-3'].includes(strategy) ? .03 : ['breakout-30-2h-retest-fixed-4', 'breakout-60-2h-retest-fixed-4'].includes(strategy) ? .04 : ['breakout-30-2h-retest-fixed-7', 'breakout-60-2h-retest-fixed-7'].includes(strategy) ? .07 : null, fixedStop = fixedTargetPct ? entry * .97 : stop, risk = entry - fixedStop, target = fixedTargetPct ? entry * (1 + fixedTargetPct) : entry + 2 * risk;
  const supportDistance = triggerTiming.levels.support ? (entry - triggerTiming.levels.support) / entry : 0, late = lateEntry(triggerTiming, triggerCandles, triggerTimeframe);
  if (risk <= 0 || !Number.isFinite(risk) || risk / entry > .08 || supportDistance > .08 || (target - entry) / entry < 0.03 || (late && !['breakout-30-2h-close', 'breakout-30-2h-retest', 'breakout-30-2h-retest-fixed-3', 'breakout-30-2h-retest-fixed-4', 'breakout-30-2h-retest-fixed-7'].includes(strategy)) || (strategy === 'ema80-breakout' && risk / entry > 0.03) || (triggerTiming.levels.resistance && triggerTiming.levels.resistance - entry < (strategy === 'refined-moderate-ema-rsi' ? 1.75 : 2) * risk)) return null;
  return { entry, stop: fixedStop, target };
}
function backtestPortfolio(trades, capital, slots = 10, multiplier = 1) {
  const closed = trades.filter(trade => trade.result !== 'open'), allocation = capital / Math.max(1, Math.min(10, slots));
  const withoutReinvestment = capital + closed.reduce((total, trade) => total + allocation * ((Number(trade.returnPct) || 0) * multiplier / 100), 0);
  const withReinvestment = closed.reduce((balance, trade) => balance + (balance / Math.max(1, Math.min(10, slots))) * ((Number(trade.returnPct) || 0) * multiplier / 100), capital);
  return { withoutReinvestment, withReinvestment, allocation };
}

function simulate(series,symbol,start,end,timeframe,strategies,options={}) {
const {'1w':week,'1d':day,'4h':h4,'2h':h2,'1h':h1}=series;
  const timeframes = Array.isArray(timeframe) ? timeframe : [timeframe];
  return timeframes.flatMap(triggerTimeframe => { const triggerSeries = { '1h': h1, '2h': h2, '4h': h4, '1d': day }[triggerTimeframe]; return strategies.map(strategy => { const trades = []; let evaluated = 0, candidates = 0; const endIndex = triggerSeries.findLastIndex(candle => candle.time <= end); for (let i = 0; i < endIndex; i++) { const candle = triggerSeries[i]; if (candle.time < start) continue; if (candle.time > end) break; const signalAt=candle.closeTime ?? (candle.time + ({'1h':1,'2h':2,'4h':4,'1d':24}[triggerTimeframe]||1)*3600000-1), slices = [week, day, h4, h2].map(series => historyUntil(series, signalAt)), hourlySlice=historyUntil(h1,signalAt), triggerSlice = triggerSeries.slice(Math.max(0, i - 209), i + 1); if (slices.some(x => !x) || !hourlySlice || triggerSlice.length < 210) continue; evaluated++; const setup = historicalSetup(...slices, ['trend','aggressive-pullback'].includes(strategy)?hourlySlice:triggerSlice, strategy, triggerTimeframe, h1, options); if (!setup) continue; candidates++; const entry = triggerSeries[i + 1].open, risk = entry - setup.stop; if (risk <= 0) continue; const target = ['trend','aggressive-pullback'].includes(strategy) ? entry + 2 * risk : setup.target || entry + 2 * risk, target3 = entry + 3 * risk; let peakHigh = entry, trade = { asset: symbol, strategyName: strategy === 'trend' ? 'Tendência + pivô' : strategy === 'aggressive-pullback' ? 'Pullback 2H + confirmação 4H' : strategy === 'expansion-retest-2h' ? 'Experimental · Rompimento + reteste 2H' : strategy === 'ema80-breakout' ? 'Rompimento antecipado · EMA 80' : strategy === 'early-breakout-2h-4h' ? 'Rompimento antecipado 2H + confirmação 4H' : strategy === 'legacy-pullback-1h' ? 'Histórico · Pullback 1H + confluência' : 'Pullback 2H + confirmação 4H', time: triggerSeries[i + 1].time, entry, stop: setup.stop, target, target3, result: 'open', hit3R: false, returnPct: (triggerSeries[endIndex].close / entry - 1) * 100, maxRisePct: 0 }; let closedAt = i + 1; for (let j = i + 1; j <= endIndex; j++) { const future = triggerSeries[j]; peakHigh = Math.max(peakHigh, future.high); if (future.low <= setup.stop && future.high >= target) { trade = { ...trade, exit: setup.stop, result: 'loss', returnPct: (setup.stop / entry - 1) * 100, maxRisePct: (peakHigh / entry - 1) * 100 }; closedAt = j; break; } if (future.low <= setup.stop) { trade = { ...trade, exit: setup.stop, result: 'loss', returnPct: (setup.stop / entry - 1) * 100, maxRisePct: (peakHigh / entry - 1) * 100 }; closedAt = j; break; } if (future.high >= target) { trade = { ...trade, exit: target, result: 'win', hit3R: future.high >= target3, returnPct: (target / entry - 1) * 100, maxRisePct: (peakHigh / entry - 1) * 100 }; closedAt = j; break; } } if (trade.result === 'open') trade.maxRisePct = (peakHigh / entry - 1) * 100; trades.push(trade); i = closedAt; } return { strategy, timeframe: triggerTimeframe, trades, evaluated, candidates }; }); });
}

return Object.freeze({historyUntil,historicalSetup,backtestPortfolio,simulate});
});
