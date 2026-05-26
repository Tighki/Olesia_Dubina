const { body, validationResult } = require('express-validator');
const { getUser } = require('./db');

const phoneRe = /\+?\d[\d\s\-()]{6,}/;
const nameRe = /^[a-zA-Zа-яА-ЯёЁ\s\-]+$/u;

const icons = {
  package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/>',
  'layout-dashboard': '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  'arrow-left-right': '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  'alert-triangle': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  'trash-2': '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
};

function icon(name, size = 20) {
  const p = icons[name];
  return p ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>` : '';
}

function loadUser(req, res, next) {
  res.locals.user = null;
  res.locals.isAdmin = false;
  if (req.session.userId) {
    const u = getUser.get(req.session.userId);
    if (u && !u.blocked) {
      res.locals.user = u;
      res.locals.isAdmin = u.role === 'admin';
    } else req.session.destroy(() => {});
  }
  next();
}

const requireLogin = (req, res, next) => (res.locals.user ? next() : res.redirect('/login'));
const requireAdmin = (req, res, next) => {
  if (!res.locals.user) return res.redirect('/login');
  if (!res.locals.isAdmin) return res.status(403).render('pages/err', { title: 'Доступ запрещён', code: 403, msg: 'Доступ запрещён' });
  next();
};
const guestOnly = (req, res, next) => (res.locals.user ? res.redirect('/') : next());

const registerRules = [
  body('full_name').trim().notEmpty().withMessage('Укажите ФИО').matches(nameRe).withMessage('ФИО: только буквы, пробел и дефис'),
  body('email').trim().isEmail().withMessage('Некорректный email').custom((v) => {
    if (phoneRe.test(v)) throw new Error('В email нельзя указывать номер телефона');
    return true;
  }),
  body('password').isLength({ min: 8 }).withMessage('Пароль: минимум 8 символов')
    .matches(/[a-zA-Zа-яА-Я]/).withMessage('Пароль должен содержать букву')
    .matches(/\d/).withMessage('Пароль должен содержать цифру'),
  body('confirmPassword').custom((v, { req }) => {
    if (v !== req.body.password) throw new Error('Пароли не совпадают');
    return true;
  }),
  body('agreeTerms').equals('on').withMessage('Необходимо согласие с правилами'),
  body('confirmNotRobot').equals('on').withMessage('Подтвердите, что вы не робот'),
];
const loginRules = [
  body('email').trim().isEmail().withMessage('Некорректный email'),
  body('password').notEmpty().withMessage('Введите пароль'),
];

function valErr(req) {
  const r = validationResult(req);
  if (r.isEmpty()) return null;
  const m = {};
  r.array().forEach((e) => { if (!m[e.path]) m[e.path] = e.msg; });
  return m;
}

module.exports = { icon, loadUser, requireLogin, requireAdmin, guestOnly, registerRules, loginRules, valErr };
