const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `(function(){ var T = fmtDate(new Date());
    ingredients=[{id:'pan',name:'Paneer',localName:'पनीर',unit:'g',vendor:'Sharma Dairy',openingStock:500,openingDate:addDays(T,-8),minStock:2000},
      {id:'mk',name:'Milk',unit:'ml',vendor:'Sharma Dairy',openingStock:50000,openingDate:addDays(T,-8)},
      {id:'on',name:'Onion',unit:'g',openingStock:5000,openingDate:addDays(T,-8)}];
    purchases=[{id:'p1',date:addDays(T,-9),vendor:'Sharma Dairy',item:'Paneer',qty:1,unit:'kg',rate:300,mode:'Cash'},{id:'p2',date:addDays(T,-9),vendor:'Sharma Dairy',item:'Milk',qty:1,unit:'litre',rate:60,mode:'Cash'}];
    purchases.forEach(function(x){ x.date = addDays(T,-20); });
    pos=[]; wastage=[]; stockAudits=[]; dishLog=[]; menuItems=[];
    saveIngredients(); savePurch(); savePos(); saveWastage(); saveAudits(); renderAll(); showView('kitchen'); })()`);
  assert(await p.isVisible('nav.tabs button[data-v="kitchen"]'), 'Kitchen tab in the bottom bar');
  const kb = await p.$$eval('#kitchenView .kbig', a => a.map(x => x.getAttribute('data-kv') || x.id));
  assert(JSON.stringify(kb)==='["k_cook","buy","recv","waste","count","k_checks"]', 'five big picture buttons: '+JSON.stringify(kb));
  assert(/1/.test(await p.textContent('.kbig.buy em')), 'Need-to-buy shows 1 item low');
  await p.screenshot({ path: process.env.S+'/kitchen_home.png' });
  // buy
  await p.click('.kbig.buy');
  const first = await p.textContent('.ktile');
  assert(/पनीर/.test(first) && /कम है/.test(first), 'low item first, with Hindi name and "कम है" flag');
  await p.click('[data-kbuy="pan"]');
  assert(await p.textContent('#kq_v')==='3.5', 'paneer quantity suggested from stock (3.5 kg): '+await p.textContent('#kq_v'));
  await p.click('[data-kc="2"]'); await p.click('#kq_ok');
  await p.click('[data-kbuy="mk"]'); await p.click('[data-kc="10"]'); await p.click('#kq_ok');
  await p.click('[data-kbuy="on"]'); await p.click('#kq_p'); await p.click('#kq_p'); await p.click('#kq_ok');
  assert(/🛒 3/.test(await p.textContent('.cbar')), 'basket has 3 items');
  await p.screenshot({ path: process.env.S+'/kitchen_buy.png' });
  await p.click('#k_send'); await p.click('[data-kn="1"]'); await p.click('#ks_ok'); await p.waitForTimeout(200); await dis();
  let r = await E(p, `pos.map(function(x){ return [x.vendor, x.status, x.needBy===addDays(fmtDate(new Date()),1), x.lines.map(function(l){ return l.item+':'+l.qty+l.unit+'@'+l.rate; }).join(',')]; })`);
  assert(JSON.stringify(r)==='[["Sharma Dairy","approved",true,"Paneer:2kg@300,Milk:10litre@60"],["Any shop","approved",true,"Onion:1kg@0"]]', 'one order per vendor, kg/litre, last prices: '+JSON.stringify(r));
  // receive
  await E(p, `pos[0].status='ordered'; savePos(); renderAll(); kView='home'; renderKitchen();`);
  assert(/1/.test(await p.textContent('.kbig.recv em')), 'Goods arrived shows 1 order');
  await p.click('.kbig.recv'); await p.click('.kpo');
  await p.click('#kr_ok'); assert(/every item/.test(await p.textContent('#kr_err')), 'must mark every item');
  await p.click('[data-kall="0"]'); await p.click('[data-kless="1"]');
  assert(/9.5/.test(await p.textContent('.krow.short')), 'less came: steps down to 9.5 litre');
  await p.click('[data-krate="1"]'); await p.fill('[data-kri="1"]','64');
  await p.screenshot({ path: process.env.S+'/kitchen_recv.png' });
  await p.click('#kr_ok'); await p.waitForTimeout(200); await dis();
  r = await E(p, `({ st: pos[0].status, pr: purchases.filter(function(x){ return x.poId===pos[0].id; }).map(function(x){ return [x.item, x.qty, x.rate, x.mode]; }) })`);
  assert(JSON.stringify(r)==='{"st":"partial","pr":[["Paneer",2,300,"Credit"],["Milk",9.5,64,"Credit"]]}', 'delivery saved as purchases, order part received: '+JSON.stringify(r));
  // waste
  await p.click('.kbig.waste'); await p.click('[data-kwaste="mk"]'); await p.click('[data-kc="1"]'); await p.click('#kq_ok');
  assert(/why/i.test(await p.textContent('#kq_err')), 'wastage needs a reason');
  await p.click('[data-kr="Spoiled / expired"]'); await p.click('#kq_ok'); await p.waitForTimeout(200); await dis();
  r = await E(p, `wastage.map(function(w){ return [w.ingredientId, w.qty, w.reason]; })`);
  assert(JSON.stringify(r)==='[["mk",1000,"Spoiled / expired"]]', 'wastage saved as 1000 ml: '+JSON.stringify(r));
  // count
  await p.click('#k_back'); await p.click('.kbig.count'); await p.click('[data-kcount="on"]');
  assert(!/5000|in stock|expected/i.test(await p.textContent('#sheet')), 'count sheet does not show the expected amount');
  await p.fill('#kq_in','3.5'); await p.click('#kq_ok');
  r = await E(p, `stockAudits.map(function(a){ return [a.ingredientId, a.counted, a.expected]; })`);
  assert(JSON.stringify(r)==='[["on",3500,5000]]', 'count saved in grams with expected kept for the manager: '+JSON.stringify(r));
  assert(/✔/.test(await p.textContent('[data-kcount="on"]')), 'counted item ticked');
  // simple mode
  await p.click('#k_back'); await p.click('#k_simple'); await p.click('.kbig.buy'); await p.screenshot({ path: process.env.S+'/kitchen_simple.png' });
  await E(p, `setSimpleMode(false)`);
  // billing login sees only Need to buy
  await call(p, 'POST', '/api/users', { login:'bill-1', outlet:'rimjhim', name:'Raju', access:'billing', password:'secret123' });
  const B = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  B.on('pageerror', e => errs.push('B: '+e.message));
  await B.route(u => u.pathname === '/', r2 => r2.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await B.goto('http://127.0.0.1:8787/'); await B.waitForSelector('#loginBg.on'); await B.fill('#loginId','bill-1'); await B.fill('#loginPin','secret123'); await B.click('#loginGo'); await B.waitForTimeout(3000);
  await E(B, `showView('kitchen')`);
  const bb = await B.$$eval('#kitchenView .kbig', a => a.map(x => x.getAttribute('data-kv') || x.id));
  assert(JSON.stringify(bb)==='["k_cook","buy","k_checks"]', 'billing login: only Need to buy and checks: '+JSON.stringify(bb));
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
