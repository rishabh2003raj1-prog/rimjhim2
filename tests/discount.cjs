const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  await E(p, `menuItems=[{id:'c1',name:'Masala Chai',category:'Tea & Coffee',price:20,veg:'veg',active:true},{id:'c2',name:'Veg Thali',category:'Thali',price:150,veg:'veg',active:true}];
    sales=[]; dishLog=[]; offers=[]; saveMenu(); saveSales(); saveDishLog(); saveOffers(); renderAll(); showView('counter');`);
  // owner sets limit and an offer
  await p.click('#ct_upi'); await p.fill('#up_max','10');
  await p.fill('#of_name','Hospital staff'); await p.fill('#of_val','15'); await p.selectOption('#of_kind','pct'); await p.click('#of_add');
  assert(/Hospital staff \(15% off\)/.test(await p.textContent('#sheet')), 'offer listed in settings');
  await p.click('#up_save');
  let r = await E(p, `({o:offers.map(function(o){return [o.name,o.kind,o.value];}), m:settings.maxDiscountPct})`);
  assert(JSON.stringify(r)==='{"o":[["Hospital staff","pct",15]],"m":10}', 'offer and limit saved: '+JSON.stringify(r));
  // bill 200 with saved offer
  await p.click('.ctile[data-add="c2"]'); await p.click('.ctile[data-add="c1"]'); await p.click('.ctile[data-add="c1"]');
  await p.click('#ct_go'); await p.click('#pp_disc');
  await p.screenshot({ path: process.env.S+'/disc_pick.png' });
  await p.click('[data-offer]');
  assert(/₹161/.test(await p.textContent(".ptotal")) && /− ₹29/.test(await p.textContent('#pp_disc')), 'offer: ₹190 bill → 15% off ₹29? check: '+await p.textContent('#pp_disc')+' '+await p.textContent('.ptotal'));
  await p.screenshot({ path: process.env.S+'/disc_bill.png' });
  await p.click('[data-pay="cash"]'); assert(/₹161/.test(await p.textContent("#sheet h2")), 'cash step uses discounted total');
  await p.click('#pp_done'); await p.click('#pd_ok');
  r = await E(p, `(function(){ var s = sales[0]; return [s.amount, s.order.subtotal, s.order.discount, s.order.discountLabel, !!s.order.offerId]; })()`);
  assert(JSON.stringify(r)==='[160,190,30,"Hospital staff",true]' || JSON.stringify(r)==='[161,190,29,"Hospital staff",true]', 'sale saved net with discount: '+JSON.stringify(r));
  assert(await E(p, 'counterDisc===null'), 'discount cleared for next customer');
  // custom discount with reason
  await p.click('.ctile[data-add="c2"]'); await p.click('#ct_go'); await p.click('#pp_disc');
  await p.fill('#pd_val','200'); await p.click('#pd_apply'); assert(/less than the bill/.test(await p.textContent('#pd_err')), 'discount bigger than bill refused');
  await p.fill('#pd_val','25'); await p.fill('#pd_why','regular'); await p.click('#pd_apply');
  assert(/₹125/.test(await p.textContent('.ptotal')) && /regular/.test(await p.textContent('#pp_disc')), 'custom ₹25 off with reason');
  await p.click('#pp_disc'); await p.click('#pd_none'); assert(/₹150/.test(await p.textContent('.ptotal')), 'discount removed');
  await E(p, 'closeForm(); counterOrder={}; counterDisc=null; renderCounter();');
  // billing login limit
  await E(p, `myAccess = function(){ return 'billing'; }; renderCounter();`);
  await p.click('.ctile[data-add="c2"]'); await p.click('#ct_go'); await p.click('#pp_disc');
  const q = await p.$$eval('[data-qd]', a => a.map(x => x.getAttribute('data-qd')));
  assert(JSON.stringify(q)==='["pct:5","pct:10","amt:10"]', 'billing sees only quick discounts within 10% of ₹150: '+JSON.stringify(q));
  await p.fill('#pd_val','20'); await p.click('#pd_apply'); assert(/up to 10%/.test(await p.textContent('#pd_err')), 'billing: ₹20 on ₹150 over the limit refused');
  await p.click('[data-offer]'); assert(/₹127/.test(await p.textContent('.ptotal')), 'billing: saved offer allowed beyond the limit');
  await p.click('[data-pay="upi"]'); await p.click('#pp_done'); await p.click('#pd_ok');
  await E(p, 'openCounterBills(fmtDate(new Date()))');
  const t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Discounts given \(2 bills\)/.test(t) && /bill was ₹190/.test(t), "today's bills show discounts: "+t.slice(0,300));
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
