const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function flush(p){ await E(p, 'scheduleFlush(0)'); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 }); }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `(function(){ var T = fmtDate(new Date());
    customers=[{id:'c1',name:'Sharma ji',phone:'+91 98765-43210'},{id:'c2',name:'Gupta',phone:''}];
    sales=[{id:'s1',date:addDays(T,-3),customer:'Sharma ji',amount:300,gst:0,mode:'Credit',order:{no:4,items:[{name:'Veg Thali',qty:2,price:150}]}},
      {id:'s2',date:addDays(T,-1),customer:'sharma ji ',amount:200,gst:0,mode:'Cash'},
      {id:'s3',date:T,customer:'Gupta',amount:999,gst:0,mode:'Credit'},{id:'s4',date:T,customer:'Counter',amount:5555,gst:0,mode:'UPI'}];
    creditPayments=[{id:'cp1',customerId:'c1',date:addDays(T,-1),amount:100,mode:'UPI'},{id:'cp2',customerId:'c2',date:T,amount:50}];
    menuItems=[{id:'m1',name:'Masala Chai',localName:'मसाला चाय',category:'Tea',price:20,veg:'veg',active:true},{id:'m2',name:'Chicken Biryani',category:'Biryani',price:199,veg:'nonveg',active:true,soldOut:T},{id:'m3',name:'Old',category:'Tea',price:10,active:false}];
    offers=[{id:'o1',name:'Hospital staff',kind:'pct',value:10,active:true}];
    settings.upiId='rimjhim@okaxis'; settings.upiName='RimJhim Cafe'; settings.bankBalance=99999;
    saveCustomers(); saveSales(); saveCreditPayments(); saveMenu(); saveOffers(); saveSettings(); renderAll(); })()`);
  await flush(p);
  await E(p, `openCustomerDetail('c2')`); await p.waitForSelector('#ca_give'); await p.click('#ca_give');
  assert(/phone number first/.test(await p.textContent('#dlgMsg')), 'no phone: asks for the number'); await dis();
  await E(p, `openCustomerDetail('c1')`); await p.waitForSelector('#ca_give');
  assert(/see their own udhaar/.test(await p.textContent('#cd_appst')), 'customer app section shown');
  await p.click('#ca_give'); await p.waitForSelector('.custcode');
  const code = (await p.textContent('.custcode')).replace(/\s/g,'');
  assert(/^\d{6}$/.test(code), 'six-digit code shown once: '+code);
  await p.screenshot({ path: process.env.S+'/cust_code.png' });
  // customer phone, separate browser
  const C = await (await b.newContext({ viewport:{width:400,height:850} })).newPage(); C.on('pageerror', e => errs.push('C: '+e.message));
  const res = await C.goto('http://127.0.0.1:8787/c?p=9876543210');
  assert(res.status()===200 && await C.isVisible('#login'), '/c opens the customer sign-in');
  assert(await C.inputValue('#ph')==='9876543210', 'phone filled from the link');
  await C.fill('#cd', code==='000000' ? '111111' : '000000'); await C.click('#go'); await C.waitForTimeout(800);
  assert(/Wrong phone number or code/.test(await C.textContent('#err')), 'wrong code refused');
  await C.fill('#ph', '+91 98765 43210'); await C.fill('#cd', code); await C.click('#go'); await C.waitForTimeout(1500); await C.waitForSelector('#app:not(.hidden)');
  const t = (await C.textContent('#app')).replace(/\s+/g,' ');
  assert(/Namaste, Sharma ji/.test(t) && /₹200/.test(t) && /to pay/.test(t), 'udhaar due ₹200 (300 credit − 100 paid)');
  assert(/2 visits/.test(t) && /2× Veg Thali/.test(t) && /Hospital staff/.test(t) && /Masala Chai/.test(t), 'visits, bills with items, offers, menu');
  await C.waitForSelector('#qr svg', { timeout:5000 }).catch(()=>{}); assert(await C.$('#qr svg'), 'UPI QR for the due amount');
  await C.click('[data-c="Biryani"]'); assert(/Sold out today/.test(await C.textContent('#app')), 'sold-out dish marked');
  await C.screenshot({ path: process.env.S+'/cust_page.png', fullPage:true });
  // what the customer can reach
  const me = await call(C, 'GET', '/api/cust/me'); const raw = JSON.stringify(me.json);
  assert(!/Gupta|5555|999|99999|bankBalance|Old/.test(raw), 'customer view has nobody else\'s data, no bank, no hidden dishes');
  assert((await call(C, 'GET', '/api/data?outlet=rimjhim')).status===401, 'customer cannot read business data');
  assert((await call(C, 'GET', '/api/session')).status===401, 'customer is not a staff session');
  assert((await call(C, 'POST', '/api/cust/code?outlet=rimjhim', { customerId:'c1' })).status===401, 'customer cannot make codes');
  // staff roles
  await call(p, 'POST', '/api/users', { login:'chef-1', outlet:'rimjhim', name:'Sonu', access:'chef', password:'secret123' });
  await call(p, 'POST', '/api/users', { login:'bill-1', outlet:'rimjhim', name:'Raju', access:'billing', password:'secret123' });
  async function staff(id){ const s = await (await b.newContext()).newPage(); await s.goto('http://127.0.0.1:8787/'); await s.evaluate(async (id) => { await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login:id, password:'secret123' }) }); }, id); return s; }
  const CH = await staff('chef-1'), BI = await staff('bill-1');
  assert((await call(CH, 'POST', '/api/cust/code?outlet=rimjhim', { customerId:'c1' })).status===403, 'chef cannot give app access');
  const bc = await call(BI, 'POST', '/api/cust/code?outlet=rimjhim', { customerId:'c1' });
  assert(bc.status===200 && /^\d{6}$/.test(bc.json.code), 'counter staff can give a code');
  // a new code signs the old phone out
  assert((await call(C, 'GET', '/api/cust/me')).status===401, 'new code signs out the old session');
  const r1 = await call(C, 'POST', '/api/cust/login', { phone:'9876543210', code });
  assert(r1.status===401, 'old code no longer works');
  assert((await call(C, 'POST', '/api/cust/login', { phone:'9876543210', code: bc.json.code })).status===200, 'new code works');
  // remove access
  await E(p, `openCustomerDetail('c1')`); await p.waitForSelector('#ca_rm'); await p.click('#ca_rm'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(800);
  assert((await call(C, 'GET', '/api/cust/me')).status===401, 'removing access signs the customer out');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
