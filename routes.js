const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { db, getUserByEmail, applyMovement } = require('./db');
const { guestOnly, requireLogin, requireAdmin, registerRules, loginRules, valErr } = require('./lib');

const router = express.Router();
const cats = () => db.prepare('SELECT * FROM categories ORDER BY name').all();
const flash = (req, t, m) => { req.session.flash = { type: t, msg: m }; };

router.get('/', (req, res) => res.redirect(res.locals.user ? '/dashboard' : '/login'));

router.get('/login', guestOnly, (req, res) => res.render('pages/login', { title: 'Вход', errors: null, values: {} }));
router.post('/login', guestOnly, loginRules, (req, res) => {
  const errors = valErr(req);
  if (errors) return res.render('pages/login', { title: 'Вход', errors, values: req.body });
  const user = getUserByEmail.get(req.body.email.trim().toLowerCase());
  if (!user || user.blocked || !bcrypt.compareSync(req.body.password, user.password_hash)) {
    return res.render('pages/login', { title: 'Вход', errors: { _form: 'Неверный email или пароль' }, values: req.body });
  }
  req.session.userId = user.id;
  flash(req, 'success', 'Добро пожаловать!');
  res.redirect('/dashboard');
});

router.get('/register', guestOnly, (req, res) => res.render('pages/register', { title: 'Регистрация', errors: null, values: {} }));
router.post('/register', guestOnly, registerRules, (req, res) => {
  const errors = valErr(req);
  if (errors) return res.render('pages/register', { title: 'Регистрация', errors, values: req.body });
  const email = req.body.email.trim().toLowerCase();
  if (getUserByEmail.get(email)) {
    return res.render('pages/register', { title: 'Регистрация', errors: { email: 'Email уже зарегистрирован' }, values: req.body });
  }
  req.session.userId = db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)')
    .run(email, bcrypt.hashSync(req.body.password, 10), req.body.full_name.trim(), 'user').lastInsertRowid;
  flash(req, 'success', 'Регистрация успешна');
  res.redirect('/dashboard');
});
router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

router.use(requireLogin);

router.get('/dashboard', (req, res) => {
  res.render('pages/dashboard', {
    title: 'Дашборд',
    stats: db.prepare('SELECT (SELECT COUNT(*) FROM products) sku_count, (SELECT COALESCE(SUM(quantity),0) FROM products) total_qty').get(),
    lowStock: db.prepare(`SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.quantity<p.min_stock ORDER BY p.quantity`).all(),
  });
});

router.get('/products', (req, res) => {
  const q = (req.query.q || '').trim(), cat = req.query.cat || '';
  let sql = 'SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE 1=1';
  const p = [];
  if (q) { sql += ' AND (p.name LIKE ? OR p.sku LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  if (cat) { sql += ' AND p.category_id=?'; p.push(cat); }
  res.render('pages/products', { title: 'Товары', products: db.prepare(sql + ' ORDER BY p.name').all(...p), categories: cats(), q, cat });
});

const productRules = [
  body('sku').trim().notEmpty().withMessage('Укажите SKU'),
  body('name').trim().notEmpty().withMessage('Укажите название'),
  body('quantity').isInt({ min: 0 }).withMessage('Количество ≥ 0'),
  body('min_stock').isInt({ min: 0 }).withMessage('Мин. остаток ≥ 0'),
  body('unit').trim().notEmpty().withMessage('Укажите единицу'),
];

function saveProduct(req, res, id) {
  const errors = valErr(req);
  const data = { sku: req.body.sku.trim(), name: req.body.name.trim(), category_id: req.body.category_id || null,
    quantity: +req.body.quantity, unit: req.body.unit.trim(), min_stock: +req.body.min_stock };
  if (errors) return res.render('pages/product-form', { title: id ? 'Редактирование' : 'Новый товар', product: { id, ...data }, categories: cats(), errors });
  try {
    if (id) {
      db.prepare('UPDATE products SET sku=?,name=?,category_id=?,quantity=?,unit=?,min_stock=? WHERE id=?')
        .run(data.sku, data.name, data.category_id, data.quantity, data.unit, data.min_stock, id);
      flash(req, 'success', 'Товар обновлён');
    } else {
      db.prepare('INSERT INTO products (sku,name,category_id,quantity,unit,min_stock) VALUES (?,?,?,?,?,?)')
        .run(data.sku, data.name, data.category_id, data.quantity, data.unit, data.min_stock);
      flash(req, 'success', 'Товар добавлен');
    }
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.render('pages/product-form', { title: id ? 'Редактирование' : 'Новый товар', product: { id, ...data }, categories: cats(), errors: { sku: 'SKU уже существует' } });
    }
    throw e;
  }
  res.redirect('/products');
}

router.get('/products/new', requireAdmin, (req, res) => res.render('pages/product-form', { title: 'Новый товар', product: null, categories: cats(), errors: null }));
router.get('/products/:id/edit', requireAdmin, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!product) return res.redirect('/products');
  res.render('pages/product-form', { title: 'Редактирование', product, categories: cats(), errors: null });
});
router.post('/products', requireAdmin, productRules, (req, res) => saveProduct(req, res, null));
router.post('/products/:id', requireAdmin, productRules, (req, res) => saveProduct(req, res, +req.params.id));
router.post('/products/:id/delete', requireAdmin, (req, res) => {
  if (db.prepare('SELECT COUNT(*) c FROM stock_movements WHERE product_id=?').get(req.params.id).c) {
    flash(req, 'error', 'Нельзя удалить: есть движения по товару');
  } else {
    db.prepare('DELETE FROM products WHERE id=?').run(req.params.id);
    flash(req, 'success', 'Товар удалён');
  }
  res.redirect('/products');
});

router.get('/movements', (req, res) => {
  res.render('pages/movements', { title: 'Приход / Расход', products: db.prepare('SELECT id,sku,name,quantity FROM products ORDER BY name').all(), errors: null });
});
router.get('/history', (req, res) => {
  res.render('pages/history', {
    title: 'История',
    history: db.prepare(`SELECT m.*,p.sku,p.name product_name,u.full_name user_name FROM stock_movements m
      JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 50`).all(),
  });
});
router.post('/movements', [
  body('product_id').isInt({ min: 1 }).withMessage('Выберите товар'),
  body('type').isIn(['in', 'out']).withMessage('Некорректный тип'),
  body('qty').isInt({ min: 1 }).withMessage('Количество ≥ 1'),
], (req, res) => {
  const errors = valErr(req);
  const products = db.prepare('SELECT id,sku,name,quantity FROM products ORDER BY name').all();
  if (errors) return res.render('pages/movements', { title: 'Приход / Расход', products, errors });
  try {
    applyMovement(+req.body.product_id, res.locals.user.id, req.body.type, +req.body.qty, req.body.note);
    flash(req, 'success', req.body.type === 'in' ? 'Приход оформлен' : 'Расход оформлен');
    res.redirect('/history');
  } catch (e) {
    res.render('pages/movements', { title: 'Приход / Расход', products, errors: { _form: e.message } });
  }
});

router.get('/admin/users', requireAdmin, (req, res) => {
  res.render('pages/users', {
    title: 'Пользователи',
    users: db.prepare('SELECT id,email,full_name,role,blocked,created_at FROM users ORDER BY created_at DESC').all(),
  });
});
router.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  const id = +req.params.id;
  if (id === res.locals.user.id && role !== 'admin') flash(req, 'error', 'Нельзя снять роль admin с себя');
  else { db.prepare('UPDATE users SET role=? WHERE id=?').run(role, id); flash(req, 'success', 'Роль обновлена'); }
  res.redirect('/admin/users');
});
router.post('/admin/users/:id/block', requireAdmin, (req, res) => {
  const id = +req.params.id;
  if (id === res.locals.user.id) flash(req, 'error', 'Нельзя заблокировать себя');
  else {
    const blocked = req.body.blocked === '1' ? 1 : 0;
    db.prepare('UPDATE users SET blocked=? WHERE id=?').run(blocked, id);
    flash(req, 'success', blocked ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
  }
  res.redirect('/admin/users');
});

module.exports = router;
