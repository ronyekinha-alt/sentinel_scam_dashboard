(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = value => Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:4});
  async function refresh() {
    const target=document.getElementById('onchainContent');
    try {
      const response=await fetch('onchain-report.json',{cache:'no-store'});
      if(!response.ok) throw new Error('Relatório indisponível');
      const report=await response.json();
      const stale=!Number.isFinite(Date.parse(report.asOf))||Date.now()-Date.parse(report.asOf)>86400000;
      const status={unconfigured:'Coleta não conectada',unavailable:'Fonte indisponível',partial:'Cobertura parcial',ready:'Relatório disponível'}[report.status]||'Estado desconhecido';
      const header=`<p><strong>${escape(status)}${stale?' · sem coleta recente':''}</strong> · ${report.asOf?escape(new Date(report.asOf).toLocaleString('pt-BR')):'Nenhuma coleta realizada'}</p><p>${escape(report.coverageNote)}</p>`;
      const assets=(report.assets||[]).map(asset=>{
        if(asset.coverage.negotiationsDecoded===false) asset.interpretation+=' Compras e vendas não classificadas nesta fonte; os zeros nas colunas de negociações não significam ausência de compras/vendas.';
        const positions=(asset.positions||[]).map(wallet=>`<tr><td><code>${escape(wallet.address)}</code></td><td>${wallet.balances[0]==null?'Indisponível':number(wallet.balances[0])}</td>${[1,7,30,90].map(days=>{const c=wallet.changes[days];return `<td>${c?.available?`Inicial: ${number(c.initial)}<br><strong>Variação: ${number(c.delta)} tokens</strong><br>${c.newPosition?'Nova posição':number(c.percent)+'%'}<br>A preço constante: ${c.priceNeutralUsd==null?'cotação não configurada':'US$ '+number(c.priceNeutralUsd)}`:'Histórico de saldo indisponível'}</td>`;}).join('')}</tr>`).join('');
        const rows=(asset.candidates||[]).map(wallet=>`<tr><td><code>${escape(wallet.address)}</code><br>${escape(wallet.label)}</td><td>${escape(wallet.classification)}<br>Confiança: ${escape(wallet.confidence)}</td>${[1,7,30,90].map(days=>{const w=wallet.windows[days]||{};return `<td>Compras: ${number(w.buys)}<br>Vendas: ${number(w.sells)}<br><strong>Líquido negociado: ${number(w.netTraded)}</strong><br>Fluxo transferido: ${number(w.netTransferred)}<br>Dias com compras: ${w.buyDays?.length||0}</td>`;}).join('')}</tr>`).join('');
        return `<details><summary><strong>${escape(asset.symbol)}</strong> · ${escape(asset.network)} · ${asset.coverage.complete?'Histórico coberto':'Histórico parcial — não concluir ausência de atividade'} · ${asset.recordCount} registros</summary><p>${escape(asset.interpretation)}</p><h3>Variação de posição em tokens</h3><p>Compara saldos reais nos blocos indicados. O preço de referência é mantido constante nas duas pontas. Não identifica posição em corretoras ou proteção em derivativos.</p><div class="table-wrap"><table><thead><tr><th>Carteira</th><th>Saldo atual</th><th>1 dia</th><th>7 dias</th><th>30 dias</th><th>90 dias</th></tr></thead><tbody>${positions||'<tr><td colspan="6">Saldos históricos ainda não coletados.</td></tr>'}</tbody></table></div><h3>Transferências e negociações classificadas</h3><p>Fluxo recebido em corretoras identificadas em 24h: ${number(asset.exchangeInflow)} tokens. Só são reconhecidos endereços com fonte de identificação.</p><div class="table-wrap"><table><thead><tr><th>Carteira</th><th>Leitura</th><th>1 dia</th><th>7 dias</th><th>30 dias</th><th>90 dias</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Sem registros elegíveis; consulte a cobertura.</td></tr>'}</tbody></table></div></details>`;
      }).join('');
      const unlocks=(report.unlocks||[]).map(item=>`<li><strong>${escape(item.symbol)}</strong> · ${escape(item.date)} · ${number(item.amount)} tokens · ${item.percent==null?'oferta circulante não confirmada':number(item.percent)+'% da oferta informada'} · ${item.verified?'fonte revisada':'revisão pendente'} · ${escape(item.source)}</li>`).join('');
      target.innerHTML=header+assets+`<h3>Desbloqueios nos próximos 90 dias</h3><ul>${unlocks||'<li>Nenhum calendário verificado cadastrado. Isto não significa ausência de desbloqueios.</li>'}</ul>`+(report.errors||[]).map(e=>`<p>${escape(e.symbol)}: ${escape(e.message)}</p>`).join('');
    } catch { target.textContent='Não foi possível consultar o relatório on-chain. Sem dados não significa ausência de risco.'; }
  }
  function init() {
    const main=document.querySelector('main'); if(!main)return;
    const panel=document.createElement('section');panel.id='onchainPanel';panel.className='panel';
    panel.innerHTML='<div class="section-heading"><div><p class="eyebrow">CONTEXTO INFORMATIVO · SEM ORDENS</p><h2>Desbloqueios e atividade on-chain</h2></div><button type="button" id="refreshOnchain">Atualizar relatório</button></div><div style="padding:20px"><p>Posições em tokens: saldo atual versus 1, 7, 30 e 90 dias, mantendo o preço constante. Piloto LINK/AAVE; amostra de carteiras. Coleta programada a cada 30 minutos, sujeita a atrasos das fontes e do agendador. Receber tokens não comprova compra.</p><div id="onchainContent" aria-live="polite">Carregando cobertura…</div></div>';
    main.append(panel);document.getElementById('refreshOnchain').addEventListener('click',refresh);refresh();setInterval(()=>{if(!document.hidden)refresh();},60000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
