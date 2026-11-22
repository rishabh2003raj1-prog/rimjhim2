const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  const t = "Purchased , 1 bottle Orange Mojito Rs 250 , 1 bottle Roohafja Rs 160 , 1 bottle strawberry crush Rs 190 , 1 bottle mango Crush Rs 190 , 1 bottle Vanilla Syrup Rs 250 , 1 bottle Chocolate Syrup , 1 jar Mix achaar Rs 180 , 1 packet Red sauce for pasta Rs 180 , 1 packet white sauce pasta Rs 220 , Raw Pasta Rs 216, 20 pc Maggi Masala Rs 100 . all purchased from Rihan Shop By Dashrath bhaiya and his own money on 11 September 2026";
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; purchases=[]; notes=[]; savePurch(); saveNotes(); window.callClaude=function(){ return Promise.resolve([{type:'purchase',unclear:true,reason:'Multiple items purchased, unclear total amount'}]); }; callClaude=window.callClaude; renderAll(); showView('notes');`);
  await p.fill('#noteInput', t); await p.click('#noteAddBtn'); await p.click('#noteProcessBtn'); await p.waitForTimeout(1500); await dis();
  const r = await E(p, `({ p: purchases.map(function(x){ return [x.item, x.qty, x.unit, x.rate, x.vendor, x.paidBy, x.date]; }), n: notes.map(function(n){ return [n.status, n.text, n.error]; }) })`);
  console.log(JSON.stringify(r.p.slice(0,2))); console.log(JSON.stringify(r.n));
  const tot = await E(p, `purchases.reduce(function(a,x){ return a+x.qty*x.rate; },0)`);
  assert(r.p.length===10 && Math.round(tot)===1936, '10 priced items filed, total ₹1,936: '+r.p.length+' / '+tot);
  assert(r.p.every(x => x[4]==='Rihan Shop' && x[5]==='Dashrath Bhaiya (personal)' && x[6]==='2026-09-11'), 'vendor Rihan Shop, paid by Dashrath Bhaiya personally, 11 Sep 2026');
  assert(r.n[0][0]==='processed' && r.n.length===2 && /^1 bottle Chocolate Syrup Rs \? from Rihan Shop on 11 Sept? 2026 paid by Dashrath Bhaiya own money$/.test(r.n[1][1]) && /Price missing/.test(r.n[1][2]), 'Chocolate Syrup kept as its own note asking for the price: '+JSON.stringify(r.n[1]));
  // fix the price and process the follow-up
  await E(p, `notes[1].text = notes[1].text.replace('Rs ?','Rs 260'); notes[1].status='pending'; notes[1].error=null; saveNotes(); renderAll();`);
  await E(p, `window.callClaude=function(){ return Promise.reject(new Error('offline')); }; callClaude=window.callClaude;`);
  await p.click('#noteProcessBtn'); await p.waitForTimeout(1500); await dis();
  const c = await E(p, `purchases.filter(function(x){ return /Chocolate/i.test(x.item); }).map(function(x){ return [x.qty, x.rate, x.vendor, x.paidBy, x.date]; })`);
  assert(JSON.stringify(c)==='[[1,260,"Rihan Shop","Dashrath Bhaiya (personal)","2026-09-11"]]', 'follow-up note files Chocolate Syrup correctly: '+JSON.stringify(c));
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
