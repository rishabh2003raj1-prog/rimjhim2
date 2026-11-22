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
  const t = "Purchased , 1 bottle Orange Mojito Rs 250 , 1 bottle Roohafja Rs 160 , 1 bottle strawberry crush Rs 190 , 1 bottle mango Crush Rs 190 , 1 bottle Vanilla Syrup Rs 250 , 1 bottle Chocolate Syrup Rs 200 , 1 jar Mix achaar Rs 180 , 1 packet Red sauce for pasta Rs 180 , 1 packet white sauce pasta Rs 220 , Raw Pasta Rs 216, 20 pc Maggi Masala Rs 100 . all purchased from Rihan Shop By Dashrath bhaiya and his own money on 11 September 2026";
  await E(p, `PARTNERS=['Rishabh','Dashrath Bhaiya']; purchases=[]; notes=[{id:'n1',text:'old wording',status:'error',error:'Multiple items purchased, unclear total amount',addedAt:new Date().toISOString()}]; savePurch(); saveNotes();
    window.callClaude=function(){ return Promise.resolve([{type:'purchase',unclear:true,reason:'Multiple items purchased, unclear total amount'}]); }; callClaude=window.callClaude; renderAll(); showView('notes'); openNoteSheet('n1');`);
  await p.fill('#ne_text', t); await p.click('#ne_save'); await p.waitForTimeout(1500); await dis();
  const r = await E(p, `({ n: purchases.length, tot: purchases.reduce(function(a,x){ return a+x.qty*x.rate; },0), st: notes.map(function(x){ return x.status; }) })`);
  assert(r.n===11 && Math.round(r.tot)===2136 && JSON.stringify(r.st)==='["processed"]', 'Save & process again files all 11 items (₹2,136): '+JSON.stringify(r));
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
