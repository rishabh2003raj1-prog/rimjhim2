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
  await E(p, `purchases=[]; savePurch(); renderAll(); showView('records'); switchRecordsSub('purchases');`);
  await E(p, `openForm('purchase')`).catch(()=>{});
  const groups = await p.$$eval('select.bi[data-f="category"] optgroup', a => a.map(x => x.label + ':' + x.children.length));
  console.log('   '+JSON.stringify(groups));
  assert(groups.length===4 && /Food ingredients:10/.test(groups[0]) && /Running the cafe/.test(groups[3]), 'grouped categories in the purchase form');
  await p.fill('.bi[data-f="item"][data-i="0"]', 'Onion'); await p.dispatchEvent('.bi[data-f="item"][data-i="0"]', 'change');
  assert(await p.inputValue('select.bi[data-f="category"][data-i="0"]')==='Vegetables & fruits', 'typing Onion picks Vegetables & fruits');
  await p.selectOption('select.bi[data-f="category"][data-i="0"]', 'Grocery'); await p.fill('.bi[data-f="item"][data-i="0"]', 'Paneer'); await p.dispatchEvent('.bi[data-f="item"][data-i="0"]', 'change');
  assert(await p.inputValue('select.bi[data-f="category"][data-i="0"]')==='Grocery', 'a category picked by hand is kept');
  const g = await E(p, `JSON.stringify(['LPG cylinder 19 kg','Harpic','Roohafja','Chocolate Syrup','Paper cups','Mix achaar','Maggi Masala','Red sauce for pasta','Thermal bill roll','Amul butter'].map(guessPurchCat))`);
  console.log('   '+g);
  assert(g==='["Gas (LPG)","Cleaning","Sauces, syrups & spreads","Sauces, syrups & spreads","Disposables & tissues","Sauces, syrups & spreads","Spices & masala","Sauces, syrups & spreads","Stationery & printing","Dairy"]', 'guesses');
  const r = await E(p, `(function(){ var T = fmtDate(new Date()); purchases=[{id:'a',date:T,item:'LPG cylinder',category:'Gas (LPG)',qty:1,unit:'pcs',rate:1100},{id:'b',date:T,item:'Milk',category:'Dairy',qty:10,unit:'litre',rate:60},{id:'c',date:T,item:'Mop',category:'Cleaning',qty:1,unit:'pcs',rate:200}]; return cafeSupplySpend(T,T); })()`);
  assert(r===1300, 'gas and cleaning kept out of food cost: '+r);
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
