const http = require('http');

const BASE = process.env.TEST_URL || 'http://localhost:3000';
const results = [];

function req(method, path, { body, cookie, follow = false } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { Cookie: cookie || '', 'Content-Type': 'application/x-www-form-urlencoded' },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          cookie: mergeCookies(cookie, setCookie),
          location: res.headers.location,
        });
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function mergeCookies(existing, setCookie) {
  const jar = {};
  (existing || '').split(';').forEach((p) => {
    const [k, v] = p.trim().split('=');
    if (k) jar[k] = v;
  });
  setCookie.forEach((c) => {
    const part = c.split(';')[0];
    const [k, v] = part.split('=');
    jar[k] = v;
  });
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function csrf(html) {
  const m = html.match(/name="_csrf" value="([^"]+)"/);
  return m ? m[1] : null;
}

function pass(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
}

async function run() {
  // Guest pages
  let r = await req('GET', '/login');
  pass('GET /login', r.status === 200);
  const loginCsrf = csrf(r.body);
  const loginPageCookie = r.cookie;

  r = await req('GET', '/register');
  pass('GET /register', r.status === 200);

  r = await req('GET', '/dashboard');
  pass('GET /dashboard redirects guest', r.status === 302 && r.location === '/login');

  // Admin login
  r = await req('POST', '/login', {
    body: `_csrf=${loginCsrf}&email=admin@warehouse.local&password=Admin123!`,
    cookie: loginPageCookie,
  });
  let cookie = r.cookie;
  pass('POST /login admin', r.status === 302 && (r.location === '/dashboard' || r.location?.endsWith('/dashboard')), `status=${r.status} loc=${r.location}`);

  r = await req('GET', '/dashboard', { cookie });
  pass('GET /dashboard admin', r.status === 200 && r.body.includes('Дашборд'));

  r = await req('GET', '/products', { cookie });
  pass('GET /products', r.status === 200 && r.body.includes('EL-001'));

  r = await req('GET', '/products?q=' + encodeURIComponent('Мышь'), { cookie });
  pass('GET /products search', r.status === 200 && r.body.includes('Мышь'));

  r = await req('GET', '/products/new', { cookie });
  pass('GET /products/new admin', r.status === 200);

  const newCsrf = csrf(r.body);
  const sku = 'TST-' + Date.now();
  r = await req('POST', '/products', {
    cookie,
    body: `_csrf=${newCsrf}&sku=${sku}&name=Тест товар&category_id=1&quantity=10&unit=шт&min_stock=2`,
  });
  pass('POST /products create', r.status === 302 && r.location === '/products');

  r = await req('GET', '/movements', { cookie });
  pass('GET /movements', r.status === 200);
  const moveCsrf = csrf(r.body);

  r = await req('GET', '/products', { cookie });
  const pid = (r.body.match(new RegExp(sku)) && r.body.includes(sku)) ? 'ok' : '';
  const idMatch = r.body.match(new RegExp(`/products/(\\d+)/edit[^>]*>[\\s\\S]*?${sku}`)) ||
    r.body.match(new RegExp(`<tr>[\\s\\S]*?${sku}[\\s\\S]*?/products/(\\d+)/edit`));
  const productId = idMatch ? idMatch[1] : null;

  if (productId) {
    r = await req('POST', '/movements', {
      cookie,
      body: `_csrf=${moveCsrf}&product_id=${productId}&type=in&qty=5&note=smoke-test`,
    });
    pass('POST /movements in', r.status === 302);
  } else {
    r = await req('POST', '/movements', {
      cookie,
      body: `_csrf=${moveCsrf}&product_id=1&type=in&qty=1&note=smoke`,
    });
    pass('POST /movements in', r.status === 302, 'fallback product 1');
  }

  r = await req('GET', '/history', { cookie });
  pass('GET /history', r.status === 200 && r.body.includes('Приход'));

  r = await req('GET', '/admin/users', { cookie });
  pass('GET /admin/users', r.status === 200 && r.body.includes('user@warehouse.local'));

  // User login
  r = await req('GET', '/login');
  const userCsrf = csrf(r.body);
  r = await req('POST', '/login', {
    body: `_csrf=${userCsrf}&email=user@warehouse.local&password=User123!`,
    cookie: r.cookie,
  });
  cookie = r.cookie;
  pass('POST /login user', r.status === 302);

  r = await req('GET', '/products/new', { cookie });
  pass('GET /products/new denied for user', r.status === 403);

  r = await req('GET', '/admin/users', { cookie });
  pass('GET /admin/users denied for user', r.status === 403);

  r = await req('GET', '/movements', { cookie });
  pass('GET /movements user', r.status === 200);

  // Register validation
  r = await req('GET', '/register');
  const regCsrf = csrf(r.body);
  r = await req('POST', '/register', {
    body: `_csrf=${regCsrf}&full_name=Test123&email=bad&password=short&confirmPassword=short`,
    cookie: r.cookie,
  });
  pass('POST /register validation', r.status === 200 && r.body.includes('field-error'));

  r = await req('POST', '/logout', { cookie, body: `_csrf=${regCsrf}` });
  pass('POST /logout', r.status === 302);

  // Stock out validation
  r = await req('GET', '/login');
  const aCsrf = csrf(r.body);
  r = await req('POST', '/login', {
    cookie: r.cookie,
    body: `_csrf=${aCsrf}&email=admin@warehouse.local&password=Admin123!`,
  });
  cookie = r.cookie;
  r = await req('GET', '/movements', { cookie });
  const mCsrf = csrf(r.body);
  r = await req('POST', '/movements', {
    cookie,
    body: `_csrf=${mCsrf}&product_id=1&type=out&qty=999999&note=x`,
  });
  pass('POST /movements reject overdraft', r.status === 200 && r.body.includes('Недостаточно'));

  r = await req('GET', '/404-test-page', { cookie });
  pass('GET 404', r.status === 404);

  const failed = results.filter((x) => !x.ok);
  console.log('\n---');
  console.log(`Итого: ${results.length - failed.length}/${results.length} пройдено`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
