// Purchase categories: old "Other" entries are sorted once; typing picks the category right away.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  // guesses
  const g = await E(p, `['Milk','Amul Taaza milk 1L','Aloo','aaloo','Pyaaj','pyaz','Kanda','Tamatar','दूध','आलू','प्याज़','Hari mirch','Dhaniya','Eggs','Atta 10kg','Gas cylinder'].map(function(x){ return x+'='+guessPurchCat(x); }).join(' | ')`);
  console.log('   '+g);
  assert(/Milk=Dairy/.test(g) && /Amul Taaza milk 1L=Dairy/.test(g) && /दूध=Dairy/.test(g), 'milk (also Hindi) → Dairy');
  assert(['Aloo','aaloo','Pyaaj','pyaz','Kanda','Tamatar','आलू','प्याज़','Hari mirch','Dhaniya'].every(x => g.includes(x+'=Vegetables & fruits')), 'aloo, pyaaj, tamatar… (also Hindi) → Vegetables & fruits');
  // old entries
  const t = await E(p, 'fmtDate(new Date())');
  await E(p, `purchases=[
    {id:'p1',billId:'b1',date:'${t}',vendor:'Dairy',item:'Milk',category:'Other',qty:10,unit:'L',rate:60},
    {id:'p2',billId:'b2',date:'${t}',vendor:'Sabzi',item:'Aloo',category:'Other',qty:5,unit:'kg',rate:30},
    {id:'p3',billId:'b2',date:'${t}',vendor:'Sabzi',item:'Pyaaj',category:'Grocery',qty:5,unit:'kg',rate:40},
    {id:'p4',billId:'b3',date:'${t}',vendor:'Kirana',item:'Rice',category:'Grocery',qty:5,unit:'kg',rate:60},
    {id:'p5',billId:'b3',date:'${t}',vendor:'Kirana',item:'Milk powder',category:'Other',catPicked:true,qty:1,unit:'kg',rate:400},
    {id:'p6',billId:'b3',date:'${t}',vendor:'Kirana',item:'Delivery charge',category:'Other',isDelivery:true,qty:1,unit:'bill',rate:20}];
    savePurch(); catFixRan=false; renderAll();`);
  await p.waitForTimeout(1200);
  const cats = await E(p, `purchases.map(function(x){ return x.id+':'+x.category; }).join(' ')`);
  console.log('   '+cats);
  assert(cats==='p1:Dairy p2:Vegetables & fruits p3:Vegetables & fruits p4:Grocery p5:Other p6:Other', 'old entries sorted; hand-picked and delivery left alone');
  // undo
  await E(p, `showView('records'); switchRecordsSub('purchases');`); await p.waitForTimeout(150);
  assert(/3 old purchases were moved/.test(await p.textContent('#purchList')), 'Purchases shows an undo note');
  await p.click('#cf_undo'); await p.waitForTimeout(150); await dis();
  assert(await E(p, `purchases.find(function(x){ return x.id==='p1'; }).category`)==='Other', 'undo puts them back');
  await E(p, `catFixRan=false; renderAll();`); await p.waitForTimeout(300); await dis();
  assert(await E(p, `purchases.find(function(x){ return x.id==='p1'; }).category`)==='Other', 'after undo they are not sorted again (kept as chosen)');
  // future entries: an old "Other" does not stick
  await E(p, `purchases.push({id:'p7',billId:'b4',date:'${t}',vendor:'X',item:'Tamatar',category:'Other',qty:1,unit:'kg',rate:20}); savePurch();`);
  assert(await E(p, `lastCategory('Tamatar')`)==='Vegetables & fruits', 'an earlier "Other" entry no longer decides the category');
  assert(await E(p, `lastCategory('Milk powder')`)==='Other', 'a category picked by hand is remembered');
  // bill form: picks while typing (no need to leave the box)
  await E(p, `closeForm(); openForm('purchase', null, '${t}')`); await p.waitForSelector('.bi[data-f="item"][data-i="0"]');
  await p.fill('.bi[data-f="item"][data-i="0"]', 'piyaaz');
  assert(await p.$eval('select.bi[data-f="category"][data-i="0"]', e => e.value)==='Vegetables & fruits', 'typing "piyaaz" picks Vegetables & fruits straight away');
  await p.fill('.bi[data-f="item"][data-i="0"]', 'Doodh');
  assert(await p.$eval('select.bi[data-f="category"][data-i="0"]', e => e.value)==='Dairy', 'typing "Doodh" switches to Dairy');
  await p.selectOption('select.bi[data-f="category"][data-i="0"]', 'Beverages');
  await p.fill('.bi[data-f="item"][data-i="0"]', 'Doodh 2L');
  assert(await p.$eval('select.bi[data-f="category"][data-i="0"]', e => e.value)==='Beverages', 'a category picked by hand is not overwritten');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
