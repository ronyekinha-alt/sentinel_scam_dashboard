(() => {
  const storageKey = 'sentinel-trade-bybit-readonly-profiles-v1';
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const load = () => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } };
  const save = value => localStorage.setItem(storageKey, JSON.stringify(value));
  function form(profile, label) {
    return `<article class="bybit-profile" data-profile="${profile}"><header><span class="bybit-profile-mark">B</span><div><strong>${label}</strong><small>API Bybit · somente leitura</small></div></header><div class="bybit-fields"><label>API Key<input autocomplete="off" data-key placeholder="Cole a chave somente aqui" /></label><label>Secret<input type="password" autocomplete="new-password" data-secret placeholder="Nunca envie pelo chat" /></label><label class="bybit-remember"><input type="checkbox" data-remember /> Lembrar neste computador</label><button class="primary" type="button" data-read>Ler conta</button></div><p class="bybit-status muted" data-status>Sem consulta ainda.</p><div class="bybit-result" data-result hidden></div></article>`;
  }
  function render(data) {
    const wallet = data.wallet?.list?.[0] || {}, positions = data.positions || [], executions = data.executions || [], orders = data.orders || [];
    const permissions = Object.entries(data.key?.permissions || {}).filter(([, value]) => Array.isArray(value) && value.length).map(([name]) => name).join(', ') || 'somente leitura';
    return `<div class="bybit-kpis"><span><small>Equity total</small><b>${money(wallet.totalEquity)}</b></span><span><small>Saldo carteira</small><b>${money(wallet.totalWalletBalance)}</b></span><span><small>Disponível</small><b>${money(wallet.totalAvailableBalance)}</b></span><span><small>Posições abertas</small><b>${positions.length}</b></span></div><div class="bybit-summary"><span>Modo: <b>${escape(data.account?.unifiedMarginStatus ?? '—')}</b></span><span>Permissões: <b>${escape(permissions)}</b></span><span>Execuções recentes: <b>${executions.length}</b></span><span>Ordens recentes: <b>${orders.length}</b></span></div><details><summary>Ver posições abertas e execuções recentes</summary><div class="bybit-detail"><div><b>Posições abertas</b>${positions.length ? `<ul>${positions.slice(0, 12).map(position => `<li>${escape(position.symbol)} · ${escape(position.side)} · ${escape(position.size)} @ ${escape(position.avgPrice || 'mercado')}</li>`).join('')}</ul>` : '<p>Nenhuma posição aberta retornada.</p>'}</div><div><b>Execuções recentes</b>${executions.length ? `<ul>${executions.slice(0, 12).map(execution => `<li>${escape(execution.symbol)} · ${escape(execution.side)} · ${escape(execution.execQty)} @ ${escape(execution.execPrice)}</li>`).join('')}</ul>` : '<p>Nenhuma execução recente retornada.</p>'}</div></div></details>${data.errors?.length ? `<p class="bybit-warning">Leituras parciais: ${escape(data.errors.slice(0, 2).join(' | '))}</p>` : ''}`;
  }
  async function read(profile) {
    const card = document.querySelector(`.bybit-profile[data-profile="${profile}"]`), key = card.querySelector('[data-key]').value.trim(), secret = card.querySelector('[data-secret]').value.trim(), status = card.querySelector('[data-status]'), result = card.querySelector('[data-result]'), remember = card.querySelector('[data-remember]').checked, button = card.querySelector('[data-read]');
    if (!key || !secret) { status.textContent = 'Informe API Key e Secret desta conta.'; return; }
    button.disabled = true; button.textContent = 'Lendo…'; status.textContent = 'Consultando saldo, posições, execuções e ordens — sem enviar nenhuma ordem.';
    try {
      const response = await fetch('/api/bybit/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, secret }) }), payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Falha na leitura da Bybit.');
      if (remember) { const profiles = load(); profiles[profile] = { apiKey: key, secret }; save(profiles); } else { const profiles = load(); delete profiles[profile]; save(profiles); }
      result.hidden = false; result.innerHTML = render(payload); status.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')}. Consulta somente leitura.`;
    } catch (error) { status.textContent = `Não foi possível consultar: ${error.message}`; }
    finally { button.disabled = false; button.textContent = 'Ler conta'; }
  }
  function init() {
    if (document.getElementById('bybitAccountsPanel')) return;
    const panel = document.createElement('section'); panel.className = 'panel bybit-accounts-panel'; panel.id = 'bybitAccountsPanel';
    panel.innerHTML = `<div class="section-heading"><div><p class="eyebrow">BYBIT · CONTAS EM MODO SOMENTE LEITURA</p><h2>Saldo, posições e histórico</h2></div><p class="muted">Perfis independentes. Nenhuma ordem, saque ou transferência é autorizada pelo painel.</p></div><div class="bybit-accounts-grid">${form('brasil', 'Bybit Brasil')} ${form('global', 'Bybit Internacional / Global')}</div><p class="bybit-api-note">A conexão usa a API V5 oficial. Para a conta internacional brasileira, a Bybit orienta o endpoint global; mantenha as chaves de cada conta separadas.</p>`;
    const anchor = document.getElementById('signalsPanel') || document.getElementById('backtestPanel'); anchor?.insertAdjacentElement('beforebegin', panel);
    const profiles = load(); panel.querySelectorAll('.bybit-profile').forEach(card => { const profile = card.dataset.profile, saved = profiles[profile]; if (saved?.apiKey && saved?.secret) { card.querySelector('[data-key]').value = saved.apiKey; card.querySelector('[data-secret]').value = saved.secret; card.querySelector('[data-remember]').checked = true; } card.querySelector('[data-read]').addEventListener('click', () => read(profile)); });
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();

