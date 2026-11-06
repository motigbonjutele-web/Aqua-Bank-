require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { rateLimit } = require('express-rate-limit');

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) if (!process.env[key]) { console.error(`Missing required environment variable: ${key}`); process.exit(1); }
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) { console.error('JWT_SECRET must be at least 32 characters in production.'); process.exit(1); }
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';
const COOKIE_NAME = 'mt_session';
app.disable('x-powered-by');
app.set('trust proxy', isProd ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"] } } }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false });
app.use('/api', apiLimiter);

function createToken(user) { return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'mt-dashboard', audience: 'mt-dashboard-user' }); }
function setSession(res, token) { res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || isProd, sameSite: 'strict', path: '/', maxAge: 8 * 60 * 60 * 1000 }); }
function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try { req.auth = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'mt-dashboard', audience: 'mt-dashboard-user' }); next(); }
  catch { res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true' || isProd }); return res.status(401).json({ error: 'Your session has expired. Please sign in again.' }); }
}
function dollarsToCents(value) { const n = Number(value); if (!Number.isFinite(n) || n <= 0 || n > 100000000) throw new Error('Amount must be greater than zero and within the allowed limit.'); return Math.round(n * 100); }
function money(cents) { return (Number(cents) / 100).toFixed(2); }

app.get('/api/health', async (_req, res) => { try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected', payments: process.env.PAYMENT_PROVIDER && process.env.PAYMENT_PROVIDER !== 'none' ? 'provider-configured-check-required' : 'not-configured' }); } catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); } });

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const fullName = String(req.body.fullName || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (fullName.length < 2 || fullName.length > 120) return res.status(400).json({ error: 'Enter your full name (2–120 characters).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) return res.status(400).json({ error: 'Use 12–72 UTF-8 bytes including uppercase, lowercase, and a number.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);
    const inserted = await client.query('INSERT INTO users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id,full_name,email', [fullName, email, hash]);
    const user = inserted.rows[0];
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    await client.query('INSERT INTO accounts(user_id,name,currency,balance_cents,account_last4) VALUES($1,$2,$3,0,$4)', [user.id, 'Everyday Checking', 'USD', last4]);
    await client.query('COMMIT');
    setSession(res, createToken(user));
    res.status(201).json({ user: { id: user.id, fullName: user.full_name, email: user.email } });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    console.error('Registration failed:', e.message); res.status(500).json({ error: 'Registration could not be completed.' });
  } finally { client.release(); }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  try {
    const result = await pool.query('SELECT id,full_name,email,password_hash FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    setSession(res, createToken(user)); res.json({ user: { id: user.id, fullName: user.full_name, email: user.email } });
  } catch (e) { console.error('Login failed:', e.message); res.status(500).json({ error: 'Sign in is temporarily unavailable.' }); }
});
app.get('/api/auth/me', requireAuth, async (req, res) => { const r = await pool.query('SELECT id,full_name,email FROM users WHERE id=$1', [req.auth.sub]); if (!r.rowCount) return res.status(401).json({ error: 'Account not found.' }); const u = r.rows[0]; res.json({ user: { id: u.id, fullName: u.full_name, email: u.email } }); });
app.post('/api/auth/logout', (_req, res) => { res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true' || isProd, sameSite: 'strict', path: '/' }); res.json({ ok: true }); });

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const accounts = await pool.query('SELECT id,name,currency,balance_cents,account_last4 FROM accounts WHERE user_id=$1 ORDER BY created_at', [req.auth.sub]);
    const ids = accounts.rows.map(a => a.id);
    const transactions = ids.length ? await pool.query('SELECT t.id,t.description,t.transaction_type,t.amount_cents,t.currency,t.status,t.created_at,a.name AS account_name FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE a.user_id=$1 ORDER BY t.created_at DESC LIMIT 100', [req.auth.sub]) : { rows: [] };
    const incoming = ids.length ? await pool.query('SELECT p.id,p.sender_name,p.sender_country,p.sender_bank,p.amount_cents,p.currency,p.status,p.provider_reference,p.created_at,p.updated_at FROM incoming_payments p JOIN accounts a ON a.id=p.account_id WHERE a.user_id=$1 ORDER BY p.created_at DESC LIMIT 100', [req.auth.sub]) : { rows: [] };
    const normalizedAccounts = accounts.rows.map(a => ({ id: a.id, name: a.name, currency: a.currency, balance: money(a.balance_cents), last4: a.account_last4 }));
    const total = accounts.rows.reduce((sum, a) => sum + Number(a.balance_cents), 0);
    res.json({ currency: 'USD', totalBalance: money(total), accounts: normalizedAccounts, transactions: transactions.rows.map(t => ({ id:t.id, description:t.description, type:t.transaction_type, amount:money(t.amount_cents), currency:t.currency, status:t.status, date:t.created_at, account:t.account_name })), incomingPayments: incoming.rows.map(p => ({ id:p.id, senderName:p.sender_name, senderCountry:p.sender_country, senderBank:p.sender_bank, amount:money(p.amount_cents), currency:p.currency, status:p.status, reference:p.provider_reference, createdAt:p.created_at, updatedAt:p.updated_at })), paymentsEnabled: false });
  } catch (e) { console.error('Dashboard query failed:', e.message); res.status(500).json({ error: 'Dashboard data could not be loaded.' }); }
});

app.post('/api/transfers', requireAuth, async (req, res) => {
  // Real money movement must be implemented against a contracted, authorized payment provider.
  return res.status(503).json({ error: 'Transfers are not enabled. A verified provider adapter, contract, and compliance approval must be implemented first. No funds have been moved.' });
});

// Privileged provider/import endpoint: call only from a trusted server, never from browser code.
// When status changes to received, the credit is posted once in the same database transaction.
app.post('/api/admin/incoming-payments', async (req, res) => {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey || req.get('x-admin-api-key') !== configuredKey) return res.status(401).json({ error: 'Unauthorized.' });
  const { accountId, providerReference, senderName, senderCountry, senderBank, amount, status = 'pending', providerPayload = {} } = req.body || {};
  if (!accountId || !providerReference || !senderName || !senderCountry || !senderBank) return res.status(400).json({ error: 'accountId, providerReference, senderName, senderCountry, and senderBank are required.' });
  if (!['pending','processing','received','failed','returned'].includes(status)) return res.status(400).json({ error: 'Invalid payment status.' });
  let cents; try { cents = dollarsToCents(amount); } catch (e) { return res.status(400).json({ error: e.message }); }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE', [accountId]);
    if (!account.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Account not found.' }); }
    const inserted = await client.query('INSERT INTO incoming_payments(account_id,provider_reference,sender_name,sender_country,sender_bank,amount_cents,status,provider_payload,credited_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status', [accountId, String(providerReference).slice(0,160), String(senderName).slice(0,120), String(senderCountry).slice(0,100), String(senderBank).slice(0,160), cents, status, JSON.stringify(providerPayload), status === 'received' ? new Date() : null]);
    if (status === 'received') {
      await client.query('UPDATE accounts SET balance_cents=balance_cents+$1 WHERE id=$2', [cents, accountId]);
      await client.query('INSERT INTO transactions(account_id,provider_reference,description,transaction_type,amount_cents,status) VALUES($1,$2,$3,$4,$5,$6)', [accountId, String(providerReference).slice(0,160), `International payment from ${String(senderName).slice(0,80)}`, 'credit', cents, 'completed']);
    }
    await client.query('COMMIT'); res.status(201).json({ id: inserted.rows[0].id, status: inserted.rows[0].status, credited: status === 'received' });
  } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ error: 'This provider reference has already been recorded.' }); console.error('Incoming payment import failed:', e.message); res.status(500).json({ error: 'Incoming payment could not be recorded.' }); }
  finally { client.release(); }
});

app.patch('/api/admin/incoming-payments/:id/status', async (req, res) => {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey || req.get('x-admin-api-key') !== configuredKey) return res.status(401).json({ error: 'Unauthorized.' });
  const { status } = req.body || {};
  if (!['pending','processing','received','failed','returned'].includes(status)) return res.status(400).json({ error: 'Invalid payment status.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM incoming_payments WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Payment not found.' }); }
    const p = found.rows[0];
    if (p.status === 'received' && status !== 'received') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'A credited payment cannot be downgraded automatically. Reversals need a separate audited workflow.' }); }
    if (status === 'received' && p.status !== 'received') {
      await client.query('UPDATE accounts SET balance_cents=balance_cents+$1 WHERE id=$2', [p.amount_cents, p.account_id]);
      await client.query('INSERT INTO transactions(account_id,provider_reference,description,transaction_type,amount_cents,status) VALUES($1,$2,$3,$4,$5,$6)', [p.account_id, p.provider_reference, `International payment from ${p.sender_name}`, 'credit', p.amount_cents, 'completed']);
    }
    const updated = await client.query('UPDATE incoming_payments SET status=$1,updated_at=NOW(),credited_at=CASE WHEN $1=\'received\' THEN COALESCE(credited_at,NOW()) ELSE credited_at END WHERE id=$2 RETURNING id,status', [status, p.id]);
    await client.query('COMMIT'); res.json({ id: updated.rows[0].id, status: updated.rows[0].status, credited: status === 'received' });
  } catch (e) { await client.query('ROLLBACK'); console.error('Payment status update failed:', e.message); res.status(500).json({ error: 'Payment status could not be updated.' }); }
  finally { client.release(); }
});

app.use(express.static(path.join(__dirname, 'public'), { etag: true, maxAge: isProd ? '1h' : 0 }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => { console.error('Unhandled request error:', err.message); res.status(500).json({ error: 'Unexpected server error.' }); });
let httpServer;
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received; shutting down gracefully.`);
  try {
    if (httpServer) {
      await new Promise((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    }
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
}

async function start() {
  // Fail early with a clear message if the repository was uploaded without its frontend.
  const publicDir = path.join(__dirname, 'public');
  const indexFile = path.join(publicDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`Frontend file not found: ${indexFile}. Ensure the public folder is at the repository root.`);
  }

  // Apply the idempotent schema on first boot so a newly provisioned Render database is ready for sign-up.
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  httpServer = app.listen(PORT, () => console.log(`Dashboard server listening on port ${PORT}; database schema is ready.`));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
start().catch(async error => {
  console.error('Application startup failed; check the project files, DATABASE_URL, and database access:', error.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
