require('dotenv').config();

const crypto = require('crypto');
const prod = process.env.NODE_ENV === 'production';

function getSessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.RENDER) {
    const derived = crypto.createHash('sha256')
      .update(process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL || 'sklad-uchet')
      .digest('hex');
    console.warn('SESSION_SECRET не задан — временный ключ из Render. Задайте SESSION_SECRET в Environment для стабильных сессий.');
    return derived;
  }
  if (prod) {
    console.error('SESSION_SECRET required. Render → Environment → SESSION_SECRET (32+ символов).');
    process.exit(1);
  }
  return 'dev-secret-change-in-production';
}

const sessionSecret = getSessionSecret();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const { icon, loadUser } = require('./lib');

const app = express();
app.locals.icon = icon;

if (prod) app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const publicDir = path.join(__dirname, 'public');
const staticTypes = { '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    const type = staticTypes[path.extname(filePath).toLowerCase()];
    if (type) res.setHeader('Content-Type', type);
  },
}));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: sessionSecret,
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 864e5, httpOnly: true, secure: prod ? 'auto' : false, sameSite: 'lax' },
}));
app.use((req, res, next) => {
  res.locals.isProduction = prod;
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});
app.use(loadUser);
app.get('/health', (req, res) => res.send('ok'));
app.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if ((req.body._csrf || req.headers['x-csrf-token']) !== req.session.csrfToken) {
    req.session.flash = { type: 'error', msg: 'Недействительный токен формы' };
    return res.redirect(req.get('Referer') || '/login');
  }
  next();
});
app.use(require('./routes'));
app.use((req, res) => res.status(404).render('pages/err', { title: 'Не найдено', code: 404, msg: 'Страница не найдена' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, process.env.HOST || '0.0.0.0', () => console.log(`http://localhost:${PORT}`));
