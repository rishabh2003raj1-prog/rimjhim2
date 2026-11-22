const { chromium } = require('playwright');
function assert(c, m){ console.log((c?'ok: ':'FAIL: ')+m); }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function login(b, id, pw){ const p = await (await b.newContext()).newPage(); await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on');
  if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch();
  const O = await login(b, '', '1234');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await call(O, 'POST', '/api/photos?outlet=rimjhim', { dataUrl: png });
  assert(up.status===200 && /\/api\/photos\//.test(up.json.url), 'owner uploads a photo to the main store');
  await call(O, 'PUT', '/api/data/outlets_v1?outlet=_global', { value:[{id:'o-other',name:'Other'}], baseRev:0 });
  const mk = await call(O, 'POST', '/api/users', { login:'other-desk', outlet:'o-other', name:'Other', password:'other12345' });
  assert(mk.status===200, 'store login created for another store');
  const ST = await login(b, 'other-desk', 'other12345');
  assert((await call(ST, 'GET', '/api/session')).json.role === 'store', 'store login signed in');
  const g = await ST.evaluate(async (u) => (await fetch(u)).status, up.json.url);
  assert(g===404, 'another store’s login cannot open the photo (got '+g+')');
  const g2 = await O.evaluate(async (u) => (await fetch(u)).status, up.json.url);
  assert(g2===200, 'owner still can');
  await b.close();
})();
