const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATABASE_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'warehouse.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
    blocked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'шт',
    min_stock INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    qty INTEGER NOT NULL CHECK(qty > 0),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function ensureUser(email, password, fullName, role) {
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return;
  db.prepare('INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)').run(
    email,
    bcrypt.hashSync(password, 10),
    fullName,
    role
  );
}

function ensureCategory(name) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name);
  if (row) return row.id;
  return db.prepare('INSERT INTO categories (name) VALUES (?)').run(name).lastInsertRowid;
}

function ensureProduct(sku, name, categoryId, quantity, unit, minStock) {
  if (db.prepare('SELECT id FROM products WHERE sku = ?').get(sku)) return;
  db.prepare(
    'INSERT INTO products (sku, name, category_id, quantity, unit, min_stock) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sku, name, categoryId, quantity, unit, minStock);
}

function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@warehouse.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin123!';
  ensureUser(adminEmail, adminPass, 'Администратор Системы', 'admin');
  ensureUser('user@warehouse.local', 'User123!', 'Иванов Иван Петрович', 'user');
  ensureUser('maria.sidorova@warehouse.local', 'User123!', 'Сидорова Мария Алексеевна', 'user');
  ensureUser('kozlov@warehouse.local', 'User123!', 'Козлов Дмитрий Сергеевич', 'user');

  const catNames = ['Электроника', 'Канцелярия', 'Расходники', 'Мебель', 'Инструменты', 'Упаковка'];
  const cats = {};
  catNames.forEach((n) => { cats[n] = ensureCategory(n); });

  const products = [
    ['EL-001', 'Кабель USB-C 2м', cats['Электроника'], 120, 'шт', 20],
    ['EL-002', 'Мышь беспроводная', cats['Электроника'], 45, 'шт', 10],
    ['EL-003', 'Клавиатура механическая', cats['Электроника'], 22, 'шт', 8],
    ['EL-004', 'Монитор 24"', cats['Электроника'], 6, 'шт', 5],
    ['EL-005', 'USB-хаб 4 порта', cats['Электроника'], 3, 'шт', 15],
    ['KN-101', 'Блокнот A5', cats['Канцелярия'], 200, 'шт', 30],
    ['KN-102', 'Ручка шариковая', cats['Канцелярия'], 8, 'шт', 50],
    ['KN-103', 'Степлер металлический', cats['Канцелярия'], 35, 'шт', 10],
    ['KN-104', 'Папка-регистратор', cats['Канцелярия'], 60, 'шт', 20],
    ['RX-301', 'Скотч упаковочный', cats['Расходники'], 35, 'рул', 15],
    ['RX-302', 'Перчатки нитриловые', cats['Расходники'], 12, 'уп', 25],
    ['RX-303', 'Салфетки безворсовые', cats['Расходники'], 90, 'уп', 20],
    ['MB-401', 'Стул офисный', cats['Мебель'], 14, 'шт', 5],
    ['MB-402', 'Стеллаж металлический', cats['Мебель'], 7, 'шт', 3],
    ['IN-501', 'Отвёртка набор', cats['Инструменты'], 18, 'наб', 5],
    ['IN-502', 'Дрель аккумуляторная', cats['Инструменты'], 4, 'шт', 2],
    ['UP-601', 'Короб картонный 40×30', cats['Упаковка'], 250, 'шт', 50],
    ['UP-602', 'Пузырчатая плёнка', cats['Упаковка'], 40, 'рул', 10],
  ];
  products.forEach((p) => ensureProduct(...p));

  if (db.prepare('SELECT COUNT(*) as c FROM stock_movements').get().c === 0) {
    const admin = db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('user@warehouse.local');
    const moves = [
      ['EL-001', admin.id, 'in', 50, 'Начальный остаток', '-30 days'],
      ['KN-102', user.id, 'out', 12, 'Выдача в отдел продаж', '-5 days'],
      ['RX-301', admin.id, 'in', 20, 'Поставка от поставщика', '-3 days'],
      ['EL-005', user.id, 'out', 2, 'Списание брака', '-1 days'],
      ['UP-601', admin.id, 'in', 100, 'Крупная поставка', '-2 days'],
    ];
    moves.forEach(([sku, uid, type, qty, note, offset]) => {
      const p = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku);
      if (!p) return;
      db.prepare(
        `INSERT INTO stock_movements (product_id, user_id, type, qty, note, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', '${offset}'))`
      ).run(p.id, uid, type, qty, note);
    });
  }
}

seed();

const getUser = db.prepare('SELECT id, email, full_name, role, blocked FROM users WHERE id = ?');
const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');

function applyMovement(productId, userId, type, qty, note) {
  try {
    db.exec('BEGIN');
    const p = db.prepare('SELECT quantity FROM products WHERE id = ?').get(productId);
    if (!p) throw new Error('Товар не найден');
    const delta = type === 'in' ? qty : -qty;
    if (type === 'out' && p.quantity < qty) throw new Error('Недостаточно на складе');
    db.prepare('UPDATE products SET quantity = quantity + ? WHERE id = ?').run(delta, productId);
    db.prepare(
      'INSERT INTO stock_movements (product_id, user_id, type, qty, note) VALUES (?, ?, ?, ?, ?)'
    ).run(productId, userId, type, qty, note || null);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = {
  db,
  getUser,
  getUserByEmail,
  applyMovement,
};
