/* Informational evidence analysis. No price prediction or order execution. */
(function (scope) {
  'use strict';
  const DAY = 86400000;
  const address = value => String(value || '').toLowerCase();
  const validAddress = value => /^0x[0-9a-f]{40}$/i.test(value || '');
  const excluded = new Set(['exchange', 'bridge', 'pool', 'router', 'vesting', 'treasury', 'contract', 'burn']);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function positionChange(before, after, referencePrice) {
    if (before == null || after == null || !Number.isFinite(Number(before)) || !Number.isFinite(Number(after)) || Number(before)<0 || Number(after)<0) return {available:false};
    const initial=Number(before),current=Number(after),delta=current-initial,price=Number(referencePrice);
    return {available:true,initial,current,delta,percent:initial>0?delta/initial*100:null,newPosition:initial===0&&current>0,priceNeutralUsd:Number.isFinite(price)&&price>0?delta*price:null,interpretation:delta>0?'Posição em tokens aumentou; origem das entradas ainda precisa ser classificada.':delta<0?'Posição em tokens diminuiu.':'Posição em tokens estável.'};
  }
  function analyse(asset, records, labels = {}, now = Date.now(), coverage = {}) {
    const normalizedLabels = Object.fromEntries(Object.entries(labels).filter(([,v]) => v.source).map(([k,v]) => [address(k),v]));
    const seen = new Set(), clean = [];
    for (const record of records) {
      const time = Date.parse(record.timestamp), quantity = Number(record.quantity);
      if (!record.id || seen.has(record.id) || !Number.isFinite(time) || time > now || time < now - 90 * DAY || !Number.isFinite(quantity) || quantity <= 0 || !record.source) continue;
      if (record.kind === 'swap') {
        // Require explicit quote evidence; a transfer to/from a pool alone is never a purchase.
        if (!validAddress(record.wallet) || !['buy','sell'].includes(record.side) || !Number.isFinite(Number(record.quoteUsd)) || Number(record.quoteUsd) <= 0 || !record.transactionHash) continue;
      } else if (record.kind !== 'transfer' || !validAddress(record.from) || !validAddress(record.to) || address(record.from) === address(record.to)) continue;
      seen.add(record.id); clean.push({...record, time, quantity});
    }
    const wallets = new Map();
    const eligible = wallet => validAddress(wallet) && !/^0x0{40}$/.test(wallet) && !excluded.has(normalizedLabels[wallet]?.type);
    const getWallet = wallet => {
      if (!wallets.has(wallet)) wallets.set(wallet, {address:wallet, label:normalizedLabels[wallet]?.name || 'Titular não identificado', windows:{}});
      return wallets.get(wallet);
    };
    for (const days of [1,7,30,90]) {
      for (const record of clean.filter(r => r.time >= now - days * DAY)) {
        const legs = record.kind === 'swap' ? [[address(record.wallet), record.side === 'buy' ? record.quantity : -record.quantity]] : [[address(record.from),-record.quantity],[address(record.to),record.quantity]];
        for (const [wallet,delta] of legs) {
          if (!eligible(wallet)) continue;
          const item = getWallet(wallet), w = item.windows[days] ||= {buys:0,sells:0,netTraded:0,netTransferred:0,buyUsd:0,sellUsd:0,buyDays:[],inflowDays:[],evidence:[]};
          const day = new Date(record.time).toISOString().slice(0,10);
          if (record.kind === 'swap') {
            if (delta > 0) { w.buys += delta; w.buyUsd += Number(record.quoteUsd); if (!w.buyDays.includes(day)) w.buyDays.push(day); }
            else { w.sells -= delta; w.sellUsd += Number(record.quoteUsd); }
            w.netTraded += delta;
          } else { w.netTransferred += delta; if (delta > 0 && !w.inflowDays.includes(day)) w.inflowDays.push(day); }
          if (w.evidence.length < 5) w.evidence.push({id:record.id,transactionHash:record.transactionHash,source:record.source});
        }
      }
    }
    const fresh = Number.isFinite(Date.parse(coverage.collectedAt)) && now - Date.parse(coverage.collectedAt) <= DAY;
    const complete = coverage.complete === true && coverage.startTime != null && Number(coverage.startTime) <= now - 90 * DAY;
    const candidates = [...wallets.values()].map(wallet => {
      const month = wallet.windows[30] || {}, threshold = Number(asset.whaleThresholdUsd) || 100000;
      const netBuyUsd = (month.buyUsd || 0) - (month.sellUsd || 0);
      const repeated = month.buyDays?.length >= 3 && month.netTraded > 0 && netBuyUsd >= threshold;
      const flow = month.inflowDays?.length >= 3 && month.netTransferred > 0 && Number(asset.priceUsd) > 0 && month.netTransferred * asset.priceUsd >= threshold;
      return {...wallet,netBuyUsd,classification:repeated ? 'Compras líquidas recorrentes observadas' : flow ? 'Recebimentos recorrentes; compras não confirmadas' : 'Movimentação observada',signal:repeated && complete && fresh,confidence:repeated && complete && fresh ? 'moderada' : 'baixa'};
    }).sort((a,b) => Number(b.signal)-Number(a.signal) || b.netBuyUsd-a.netBuyUsd || Math.abs(b.windows[30]?.netTransferred || 0)-Math.abs(a.windows[30]?.netTransferred || 0)).slice(0,20);
    const deposits = clean.filter(r => r.kind === 'transfer' && normalizedLabels[address(r.to)]?.type === 'exchange' && !excluded.has(normalizedLabels[address(r.from)]?.type) && r.time >= now - DAY);
    const exchangeInflow = deposits.reduce((sum,r) => sum+r.quantity,0);
    return {symbol:asset.symbol,network:asset.network,contract:asset.contract,coverage:{...coverage,complete,fresh},recordCount:clean.length,candidates,exchangeInflow,exchangeInflowUsd:Number(asset.priceUsd)>0 ? exchangeInflow*asset.priceUsd : null,interpretation:'Transferências não comprovam compras, vendas, identidade, informação privilegiada ou posição líquida em outras redes e derivativos.'};
  }
  function unlocks(events, now = Date.now()) {
    return events.map(event => {
      const time = Date.parse(event.date), amount = Number(event.amount), supply = Number(event.circulatingSupply), reviewed = Date.parse(event.reviewedAt);
      if (!Number.isFinite(time) || time < now || time > now+90*DAY || !event.source || !/^https:\/\//.test(event.source) || !Number.isFinite(amount) || amount<=0) return null;
      const fresh = Number.isFinite(reviewed) && reviewed <= now && now-reviewed<=30*DAY;
      const percent = Number.isFinite(supply) && supply>0 ? amount/supply*100 : null;
      const days = Math.ceil((time-now)/DAY);
      return {...event,days,percent,verified:event.confirmed===true && fresh,attention:event.confirmed===true && fresh && days<=7 && percent!=null && percent>=1,interpretation:'Oferta potencialmente negociável; não comprova venda nem prevê queda.'};
    }).filter(Boolean).sort((a,b)=>a.days-b.days);
  }
  function alerts(report) {
    if (report.status !== 'ready') return [];
    const result = [];
    for (const item of report.unlocks || []) if (item.attention) result.push({id:`unlock:${item.symbol}:${item.date}`,symbol:item.symbol,text:`Desbloqueio em ${item.days} dia(s): ${item.percent.toFixed(2)}% da oferta circulante informada. Fonte: ${item.source}`});
    for (const asset of report.assets || []) {
      if (asset.coverage.fresh) for (const wallet of asset.positions || []) {
        const month=wallet.changes?.[30];
        if(month?.available && month.delta>0 && (month.newPosition || month.percent>=10) && month.priceNeutralUsd>=100000)
          result.push({id:`position:${asset.network}:${asset.contract}:${wallet.address}:${new Date(report.asOf).toISOString().slice(0,10)}`,symbol:asset.symbol,text:`Posição aumentou em 30 dias: ${wallet.address}. Saldo inicial: ${month.initial}; atual: ${month.current}; acréscimo: ${month.delta} tokens. A preço constante: US$ ${month.priceNeutralUsd.toFixed(0)}. Aumento de saldo não comprova compra: transferências, recompensas e outras origens podem explicar entradas.`});
      }
      if (!asset.coverage.complete || !asset.coverage.fresh) continue;
      for (const wallet of asset.candidates.filter(w=>w.signal).slice(0,3)) result.push({id:`net-buy:${asset.network}:${asset.contract}:${wallet.address}:${new Date(report.asOf).toISOString().slice(0,10)}`,symbol:asset.symbol,text:`Compras líquidas recorrentes observadas em 30 dias: ${wallet.address}. Compras: ${wallet.windows[30].buys}; vendas: ${wallet.windows[30].sells}; líquido: ${wallet.windows[30].netTraded}. Convicção ou informação privilegiada não comprovadas.`});
      if (asset.exchangeInflowUsd >= 100000) result.push({id:`exchange:${asset.network}:${asset.contract}:${new Date(report.asOf).toISOString().slice(0,10)}`,symbol:asset.symbol,text:`Entrada em corretoras identificadas nas últimas 24h: ${asset.exchangeInflow} tokens. Valor aproximado ao preço de referência: US$ ${asset.exchangeInflowUsd.toFixed(0)}. Transferência não comprova venda.`});
    }
    return result;
  }
  function telegramMessage(alert) { return `<b>SENTINEL · CONTEXTO ON-CHAIN</b>\n<b>${escape(alert.symbol)}</b>\n${escape(alert.text)}\n<i>Informativo; não é sinal de entrada nem previsão de preço.</i>`; }
  const api = {analyse,positionChange,unlocks,alerts,telegramMessage};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.SentinelOnchain = api;
})(typeof window !== 'undefined' ? window : globalThis);
