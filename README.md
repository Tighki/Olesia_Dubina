# СкладУчёт — ИС складского учёта

Веб-приложение: остатки, приход/расход, роли пользователей.

**Стек:** Node.js 22+, Express, EJS, SQLite (`node:sqlite`), bcrypt, express-validator, helmet.

## Запуск

```bash
npm install
npm run dev
```

http://localhost:3000 · тесты: `npm test` (сервер должен быть запущен).

## Учётные данные

| Роль | Email | Пароль |
|------|-------|--------|
| Admin | `admin@warehouse.local` | `Admin123!` |
| User | `user@warehouse.local` | `User123!` |
| User | `maria.sidorova@warehouse.local` | `User123!` |
| User | `kozlov@warehouse.local` | `User123!` |

Admin: `.env` → `ADMIN_EMAIL`, `ADMIN_PASSWORD`. В БД: 18 товаров, 6 категорий, демо-история.

**Роли:** Admin — товары и пользователи; User — просмотр, приход/расход, история.

## Деплой на Render

1. Репозиторий на GitHub → Render **Blueprint** → `render.yaml`.
2. Задать **`ADMIN_PASSWORD`**. `SESSION_SECRET` — автоматически.
3. Health: `/health`. Вход: `admin@warehouse.local` + ваш пароль.

| Переменная | Обязательно | Пример |
|------------|-------------|--------|
| `NODE_ENV` | да | `production` |
| `SESSION_SECRET` | да | случайная строка |
| `ADMIN_PASSWORD` | да | ваш пароль |
| `DATABASE_DIR` | нет | `/var/data` (с диском на платном плане) |

На **Free** БД сбрасывается при новом деплое. Постоянная БД: диск `/var/data` + `DATABASE_DIR=/var/data`.

### Ошибка `SESSION_SECRET required`

Сервис создан вручную (не через Blueprint) — переменные из `render.yaml` не подставляются.

**Render Dashboard** → ваш Web Service → **Environment** → **Add Variable**:

| Key | Value |
|-----|--------|
| `SESSION_SECRET` | случайная строка (например сгенерировать: `openssl rand -hex 32`) |
| `ADMIN_PASSWORD` | ваш пароль админа |
| `NODE_ENV` | `production` |

Сохранить → **Manual Deploy** → Deploy latest commit.
