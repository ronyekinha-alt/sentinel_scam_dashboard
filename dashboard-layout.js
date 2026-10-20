(() => {
  const navItems = [
    ['⌕', 'Scanner de sinais', 'scannerAuditPanel'],
    ['⌁', 'Acompanhamento ao vivo', 'mexcLivePanel'],
    ['▥', 'Relatório / histórico', 'importedTradesPanel'],
    ['⌬', 'Validação / simulador', 'backtestPanel'],
    ['◎', 'Gerenciamento de risco', 'signalsPanel'],
    ['◌', 'Alertas do Telegram', 'signalsPanel']
  ];

  function init() {
    if (document.querySelector('.dashboard-sidebar')) return;
    const sidebar = document.createElement('aside');
    sidebar.className = 'dashboard-sidebar';
    sidebar.innerHTML = `
      <div class="dashboard-brand"><span class="dashboard-mark">S</span><span>Sentinel Trade</span></div>
      <p class="dashboard-menu-label">Módulos rápidos</p>
      <nav class="dashboard-nav">${navItems.map(([icon, label, target], index) => `<button type="button" class="dashboard-nav-item${index === 0 ? ' active' : ''}" data-target="${target}"><span>${icon}</span>${label}</button>`).join('')}</nav>
      <div class="dashboard-side-status"><p>ESTADO DO SISTEMA</p><div><span>Scanner</span><b id="dashboardSideConnection">Aguardando</b></div><div><span>Motor</span><b>Sincronizado</b></div></div>`;
    document.body.prepend(sidebar);
    document.body.classList.add('sentinel-light-dashboard');

    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.dashboard-breadcrumb')) {
      const trigger = document.createElement('button');
      trigger.type = 'button'; trigger.className = 'dashboard-hamburger'; trigger.textContent = '☰';
      trigger.title = 'Configurações gerais';
      trigger.addEventListener('click', () => document.body.classList.toggle('dashboard-menu-open'));
      const crumb = document.createElement('span');
      crumb.className = 'dashboard-breadcrumb'; crumb.innerHTML = '<b>Dashboard</b><i>›</i>Painel geral';
      topbar.prepend(crumb); topbar.prepend(trigger);
    }

    const connection = document.getElementById('connection');
    const mirrorConnection = () => {
      const target = document.getElementById('dashboardSideConnection');
      if (target && connection) target.textContent = (connection.textContent || 'Aguardando').trim();
    };
    mirrorConnection();
    if (connection) new MutationObserver(mirrorConnection).observe(connection, { childList: true, characterData: true, subtree: true });

    sidebar.querySelectorAll('.dashboard-nav-item').forEach(button => button.addEventListener('click', () => {
      const section = document.getElementById(button.dataset.target);
      if (!section) return;
      sidebar.querySelectorAll('.dashboard-nav-item').forEach(item => item.classList.remove('active'));
      button.classList.add('active');
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();

