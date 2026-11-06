(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const toast = $('#toast'); let toastTimer;
  function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3200); }
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed. Please try again.');
    return body;
  };
  const authOverlay = $('#authOverlay'), appShell = $('#appShell'), authForm = $('#authForm');
  let authMode = 'login', currentUser = null, dashboardData = null, balancesHidden = false;
  function showAuth(show) { authOverlay.hidden = !show; appShell.classList.toggle('authenticated', !show); }
  function setAuthMode(mode) {
    authMode = mode;
    const registering = mode === 'register';
    $('#authPassword').type = 'password'; $('#passwordToggle').textContent = 'Show'; $('#passwordToggle').setAttribute('aria-label', 'Show password'); $('#passwordToggle').setAttribute('aria-pressed', 'false');
    $('#authTitle').textContent = registering ? 'Create your account' : 'Welcome back';
    $('#authIntro').textContent = registering ? 'Create a secure login to access your USD dashboard.' : 'Sign in to view your account dashboard.';
    $('#fullNameLabel').hidden = !registering; $('#authFullName').hidden = !registering; $('#authFullName').required = registering;
    $('#authFullName').autocomplete = 'name'; $('#authPassword').autocomplete = registering ? 'new-password' : 'current-password';
    $('#passwordHint').hidden = !registering; $('#authPassword').minLength = registering ? 12 : 1;
    $('#authSubmit').textContent = registering ? 'Create account securely' : 'Sign in securely';
    $('#authSwitchText').textContent = registering ? 'Already registered?' : 'New here?';
    $('#authModeSwitch').textContent = registering ? 'Sign in' : 'Create an account';
    $('#authError').hidden = true; $('#authError').textContent = '';
  }
  const passwordInput = $('#authPassword'), passwordToggle = $('#passwordToggle');
  passwordToggle.addEventListener('click', () => {
    const showing = passwordInput.type === 'password';
    passwordInput.type = showing ? 'text' : 'password';
    passwordToggle.textContent = showing ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
    passwordToggle.setAttribute('aria-pressed', String(showing));
  });
  $('#authModeSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
  authForm.addEventListener('submit', async e => {
    e.preventDefault(); const submit = $('#authSubmit'); submit.disabled = true; $('#authError').hidden = true;
    const payload = { email: $('#authEmail').value.trim(), password: $('#authPassword').value };
    if (authMode === 'register') payload.fullName = $('#authFullName').value.trim();
    try {
      const result = await api(authMode === 'register' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      currentUser = result.user; $('#authPassword').value = ''; $('#authPassword').type = 'password'; $('#passwordToggle').textContent = 'Show'; $('#passwordToggle').setAttribute('aria-label', 'Show password'); $('#passwordToggle').setAttribute('aria-pressed', 'false'); await showDashboard();
    } catch (err) { $('#authError').textContent = err.message; $('#authError').hidden = false; }
    finally { submit.disabled = false; }
  });
  $('#logoutButton').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} currentUser = null; dashboardData = null; showAuth(true); setAuthMode('login'); });

  function formatMoney(amount, currency = 'USD') { return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount || 0)); }
  function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(d); }
  function make(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function statusClass(status) { return ['completed','received'].includes(status) ? 'completed' : ['pending','processing'].includes(status) ? 'pending' : 'failed'; }
  function updateBalances() {
    if (!dashboardData) return;
    const total = formatMoney(dashboardData.totalBalance);
    $('#totalBalance').textContent = balancesHidden ? '••••••••' : total;
    $$('.sensitive-balance').forEach(node => { const value = node.dataset.balance || '0.00'; node.textContent = balancesHidden ? '••••••' : formatMoney(value); });
    $('#balanceToggleText').textContent = balancesHidden ? 'Show balance' : 'Hide balance';
    $('#toggleBalance').setAttribute('aria-label', balancesHidden ? 'Show balances' : 'Hide balances');
    $('#toggleBalance').setAttribute('aria-pressed', String(balancesHidden));
  }
  function renderAccounts(accounts) {
    const list = $('.account-list'); list.replaceChildren();
    if (!accounts.length) { list.append(make('p', 'empty-state', 'No accounts are available. Contact support if you expected an account.')); return; }
    accounts.forEach((account, index) => {
      const row = make('div', 'account-row');
      row.append(make('div', `account-symbol ${index % 2 ? 'savings-symbol' : 'checking-symbol'}`, '▤'));
      const info = make('div', 'account-info'); info.append(make('strong', '', account.name), make('small', '', `${account.currency} account •••• ${account.last4}`)); row.append(info);
      const balance = make('div', 'account-balance'); const amount = make('strong', 'sensitive-balance'); amount.dataset.balance = account.balance; amount.textContent = formatMoney(account.balance, account.currency); balance.append(amount, make('small', '', 'Available balance')); row.append(balance);
      list.append(row);
    });
    updateBalances();
  }
  function renderTransactions(transactions) {
    const tbody = $('#transactionRows'); tbody.replaceChildren();
    transactions.forEach(t => {
      const tr = document.createElement('tr'); tr.dataset.search = `${t.description} ${t.account} ${t.status}`.toLowerCase();
      const merchantCell = document.createElement('td'); const merchant = make('div','merchant'); const icon = make('span','merchant-icon merchant-transfer', t.type === 'credit' ? '↙' : '↗'); const label = make('span'); label.append(make('strong','',t.description), make('small','',t.type === 'credit' ? 'Incoming payment' : 'Account activity')); merchant.append(icon,label); merchantCell.append(merchant); tr.append(merchantCell);
      tr.append(make('td','',formatDate(t.date)), make('td','',t.account)); const statusCell = document.createElement('td'); statusCell.append(make('span',`status-pill ${statusClass(t.status)}`,t.status)); tr.append(statusCell);
      const amount = make('td',`amount ${t.type === 'credit' ? 'positive' : 'negative'}`,`${t.type === 'credit' ? '+' : '−'}${formatMoney(t.amount,t.currency)}`); tr.append(amount); tbody.append(tr);
    });
    $('#transactionFooter').textContent = `${transactions.length} recorded transaction${transactions.length === 1 ? '' : 's'}`;
    $('#emptyTransactions').hidden = transactions.length > 0;
  }
  function renderIncoming(payments) {
    const list = $('#incomingPaymentsList'); list.replaceChildren();
    if (!payments.length) { list.append(make('div','empty-state','No incoming international payments have been recorded for this account.')); return; }
    payments.forEach(p => {
      const row = make('article','incoming-row'); const main = make('div','incoming-main'); main.append(make('strong','',p.senderName),make('span','',`${p.senderBank} · ${p.senderCountry}`),make('small','',`Reference: ${p.reference} · ${formatDate(p.createdAt)}`));
      const detail = make('div','incoming-detail'); detail.append(make('strong','incoming-amount',formatMoney(p.amount,p.currency)),make('span',`status-pill ${statusClass(p.status)}`,p.status)); row.append(main,detail); list.append(row);
    });
  }
  function updateMonthlyStats(transactions, accounts) {
    const now = new Date(); const month = now.getMonth(); const year = now.getFullYear();
    const monthRows = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === month && d.getFullYear() === year && ['completed','received'].includes(t.status); });
    const credits = monthRows.filter(t => t.type === 'credit').reduce((sum,t) => sum + Number(t.amount), 0);
    const debits = monthRows.filter(t => t.type === 'debit').reduce((sum,t) => sum + Number(t.amount), 0);
    $('#moneyIn').textContent = balancesHidden ? '••••••' : formatMoney(credits);
    $('#moneyOut').textContent = balancesHidden ? '••••••' : formatMoney(debits);
    $('#spentTotal').textContent = balancesHidden ? '••••••' : formatMoney(debits);
    $('#accountCount').textContent = String(accounts.length);
  }
  async function showDashboard() {
    const result = await api('/api/dashboard'); dashboardData = result;
    $('#greeting').textContent = `Welcome, ${currentUser.fullName.split(' ')[0]}`;
    $('#signedInEmail').textContent = currentUser.email;
    $('#balanceUpdated').textContent = 'Live account record from your database';
    $('#quickTransfer').disabled = !result.paymentsEnabled;
    $('#quickTransfer').title = result.paymentsEnabled ? 'Payment provider configuration is still required before sending funds' : 'Transfers are disabled until an authorized payment provider is connected';
    renderAccounts(result.accounts); renderTransactions(result.transactions); renderIncoming(result.incomingPayments); updateBalances(); updateMonthlyStats(result.transactions, result.accounts); showAuth(false);
  }
  async function bootstrap() {
    const now = new Date(); const hour = now.getHours();
    $('#greetingEyebrow').textContent = new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric'}).format(now).toUpperCase();
    try { const session = await api('/api/auth/me'); currentUser = session.user; await showDashboard(); }
    catch { showAuth(true); setAuthMode('login'); }
  }

  // Responsive sidebar drawer and desktop collapse.
  const sidebar = $('#sidebar'), menuButton = $('#mobileMenu'), backdrop = $('#sidebarBackdrop');
  function isMobile() { return window.matchMedia('(max-width: 760px)').matches; }
  function setSidebarOpen(open) {
    if (isMobile()) { sidebar.classList.toggle('open', open); document.body.classList.toggle('sidebar-drawer-open', open); }
    else { document.body.classList.toggle('sidebar-collapsed', !open); sidebar.classList.toggle('open', open); }
    menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    const glyph = menuButton.querySelector('.menu-glyph'); if (glyph) glyph.textContent = open && isMobile() ? '×' : '☰';
  }
  const sectionTitles = { overview:'Overview', accounts:'Accounts', transfers:'Transfers', payments:'Bill payments', cards:'Cards', statements:'Statements', support:'Support', settings:'Settings', transactions:'Transactions' };
  $$('.nav-item, [data-view]').forEach(button => button.addEventListener('click', event => {
    const view = button.dataset.view; if (!view) return; event.preventDefault();
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view)); $('#currentSection').textContent = sectionTitles[view] || 'Overview'; setSidebarOpen(false);
    if (view === 'overview') window.scrollTo({ top:0, behavior:'smooth' });
    else if (view === 'transactions') $('#transactionsPanel').scrollIntoView({ behavior:'smooth', block:'start' });
    else if (view === 'accounts') $('#accountsPanel').scrollIntoView({ behavior:'smooth', block:'start' });
    else if (view === 'transfers') showToast('Transfers are disabled until an authorized payment provider is configured.');
    else showToast(`${sectionTitles[view] || 'This section'} is not connected in this release.`);
  }));
  menuButton.addEventListener('click', () => { const open = isMobile() ? sidebar.classList.contains('open') : !document.body.classList.contains('sidebar-collapsed'); setSidebarOpen(!open); });
  backdrop.addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setSidebarOpen(false); });
  window.addEventListener('resize', () => { document.body.classList.remove('sidebar-drawer-open'); sidebar.classList.remove('open'); if (isMobile()) document.body.classList.remove('sidebar-collapsed'); menuButton.setAttribute('aria-expanded','false'); });

  // Theme toggle with local persistence.
  const themeToggle = $('#themeToggle');
  function applyTheme(theme) { const dark = theme === 'dark'; document.body.classList.toggle('dark-mode', dark); themeToggle.setAttribute('aria-checked',String(dark)); themeToggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode'); $('#appearanceLabel').textContent = dark?'Dark mode':'Light mode'; $('#appearanceIcon').textContent = dark?'☾':'☼'; $('meta[name="theme-color"]')?.setAttribute('content',dark?'#101a15':'#0b5b45'); }
  let savedTheme = 'light'; try { savedTheme = localStorage.getItem('mt-dashboard-theme') || 'light'; } catch {} applyTheme(savedTheme);
  themeToggle.addEventListener('click', () => { const next = themeToggle.getAttribute('aria-checked') === 'true' ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem('mt-dashboard-theme',next); } catch {} });
  $('#toggleBalance').addEventListener('click', () => { balancesHidden = !balancesHidden; updateBalances(); if (dashboardData) updateMonthlyStats(dashboardData.transactions, dashboardData.accounts); });
  $('#dismissNotice').addEventListener('click', () => $('#accountNotice').remove());
  $('#notificationButton').addEventListener('click', () => showToast('You are up to date.'));
  $('#addAccount').addEventListener('click', () => showToast('Additional account linking is not available in this release.'));
  $('#spendingPeriod').addEventListener('click', () => showToast('Reporting periods will be enabled when reporting data is added.'));
  $('#transactionFilter').addEventListener('click', () => showToast('Use the search field to filter recorded transactions.'));
  $('#transactionSearch').addEventListener('input', () => { const term = $('#transactionSearch').value.trim().toLowerCase(); let count = 0; $$('#transactionRows tr').forEach(row => { const match = `${row.dataset.search} ${row.textContent}`.toLowerCase().includes(term); row.hidden = !match; if (match) count++; }); $('#emptyTransactions').hidden = count !== 0; });
  $('#quickTransfer').addEventListener('click', () => showToast('Transfers are disabled until a verified payment provider is connected.'));
  bootstrap().catch(() => { showAuth(true); setAuthMode('login'); $('#authError').textContent = 'Could not load your account. Check the server and database setup.'; $('#authError').hidden = false; });
})();
