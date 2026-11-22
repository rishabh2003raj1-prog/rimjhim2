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
  await E(p, `(function(){ var T = fmtDate(new Date());
    ingredients=[{id:'milk',name:'Milk',unit:'ml',type:'Raw material',minStock:0,vendor:'Dairy',openingStock:40000,openingDate:addDays(T,-11),extra:'keep'},
      {id:'tea',name:'Tea leaves',unit:'g',type:'Raw material',minStock:0,vendor:'Dairy',openingStock:100000,openingDate:addDays(T,-11)},
      {id:'pan',name:'Paneer',unit:'g',type:'Raw material',minStock:0,vendor:'Sharma',openingStock:300,openingDate:addDays(T,-11)},
      {id:'grv',name:'Makhani gravy',unit:'g',type:'Cooked / prepared',minStock:0,openingStock:0,openingDate:addDays(T,-11),shelfDays:1}];
    menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true,recipe:[{ingredientId:'milk',qty:100},{ingredientId:'tea',qty:5}]},
      {id:'pt',name:'Paneer Tikka',category:'Snacks',price:180,active:true,recipe:[{ingredientId:'pan',qty:200}]}];
    dishLog=[]; for(var i=1;i<=10;i++) dishLog.push({id:'d'+i,date:addDays(T,-i),menuId:'chai',qty:30});
    dishLog.push({id:'dp',date:addDays(T,-2),menuId:'pt',qty:2});
    prepBatches=[{id:'pb',date:addDays(T,-2),outputId:'grv',outputQty:1000,inputs:[]}];
    purchases=[]; wastage=[]; stockAudits=[]; cafeUse=[]; checks=[]; assets=[]; settings.checklists=null;
    saveIngredients(); saveMenu(); saveDishLog(); savePrep(); savePurch(); saveChecks(); saveAssets(); saveSettings();
    window.__wa=[]; window.open=function(u){ window.__wa.push(decodeURIComponent(u)); };
    renderAll(); showView('records'); switchRecordsSub('stock'); })()`);
  let r = await E(p, `(function(){ var m = stockInfo(ingById('milk')); return [m.use, Math.round(m.daysLeft*10)/10, m.status, Math.round(m.level)]; })()`);
  assert(JSON.stringify(r)==='[3000,3.3,"ok",10000]', 'milk: 3 litre/day learned, 3.3 days left, fine with 1-day delivery: '+JSON.stringify(r));
  const sv = (await p.textContent('#stockView')).replace(/\s+/g,' ');
  assert(/Paneer/.test(sv) && /finished/.test(sv) && /Running low/.test(sv), 'paneer shows finished in Running low');
  assert(/Use first or throw/.test(sv) && /Makhani gravy/.test(sv) && /past its time/.test(sv), 'gravy past its keeping time');
  assert(/may not be able to make/.test(sv) && /Paneer Tikka/.test(sv), 'paneer tikka flagged as cannot make');
  assert(/uses 3 litre\/day/.test(sv) && /about 3 days left/.test(sv), 'stock row shows use per day and days left');
  // lead time 3 days via ingredient form
  await p.click('.entry[data-ing="milk"]'); 
  assert(/Uses about/.test(await p.textContent('#sheet')), 'ingredient form shows learned use');
  await p.fill('#i_lead','3'); await p.click('#i_save');
  r = await E(p, `(function(){ var g = ingById('milk'), m = stockInfo(g); return [g.leadDays, g.extra, m.status, Math.round(m.order)]; })()`);
  assert(JSON.stringify(r)==='[3,"keep","low",5000]', 'lead 3 days → milk low, order 5 litre; other fields kept: '+JSON.stringify(r));
  // order list
  await p.click('#ss_order');
  const ol = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Dairy/.test(ol) && /Sharma/.test(ol), 'order list grouped by vendor');
  r = await E(p, `document.querySelector('[data-oq="milk"]').value`);
  assert(r==='5000', 'milk order quantity 5000 ml: '+r);
  await p.fill('[data-oq="milk"]','6000'); await p.click('[data-wa="Dairy"]');
  r = await E(p, `window.__wa[0]`);
  assert(/Milk — 6 litre/.test(r) && !/Paneer/.test(r), 'WhatsApp list for Dairy: '+r);
  await E(p, 'closeForm()');
  // learned minimums
  await p.click('#ss_learn'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(200); await dis();
  r = await E(p, `ingById('milk').minStock`);
  assert(r===12000, 'learned minimum for milk = 3 litre × (3+1 days): '+r);
  // sold out on counter
  await p.click('[data-soldout="pt"]');
  assert(await E(p, `soldOutToday(menuById('pt'))`), 'paneer tikka marked sold out today');
  await E(p, `showView('counter')`);
  assert(await p.$('.ctile.soldout') && /Sold out/.test(await p.textContent('.ctile.soldout')), 'counter shows sold out tile, not tappable');
  assert(await p.$('#ct_checks'), 'counter has Checks button');
  // checklists
  await E(p, `showView('records'); switchRecordsSub('assets');`);
  let av = (await p.textContent('#assetsView')).replace(/\s+/g,' ');
  assert(/Today’s checks/.test(av) && /Opening/.test(av) && /Closing/.test(av) && /Weekly deep clean/.test(av), 'checks card with default lists');
  await p.click('[data-chk="open"]');
  await p.click('#ck_save'); assert(/every line/.test(await p.textContent('#ck_err')), 'must tick every line');
  await p.click('[data-no="1"]'); await p.fill('[data-n="1"]','fridge at 9°C'); await p.click('#ck_all'); await p.click('#ck_save'); await p.waitForTimeout(200);
  assert(/1 problem/.test(await p.textContent('#dlgMsg')), 'saved with one problem'); await dis();
  r = await E(p, `checks.map(function(c){ return [c.kind, c.listId, c.items.filter(function(i){return i.ok===false;}).map(function(i){return i.note;}).join()]; })`);
  assert(JSON.stringify(r)==='[["list","open","fridge at 9°C"]]', 'check saved with the note: '+JSON.stringify(r));
  av = (await p.textContent('#assetsView')).replace(/\s+/g,' ');
  assert(/fridge at 9°C/.test(av) && /done \d\d:\d\d/.test(av), 'problem shown on the checks card');
  // asset with daily check
  await E(p, `assets=[{id:'fr',name:'Fridge',category:'Kitchen equipment',cost:20000,maintenance:[],checkEvery:1}]; saveAssets(); renderAll(); showView('records'); switchRecordsSub('assets');`);
  assert(/check due/.test(await p.textContent('#assetsView')), 'fridge check due');
  await p.click('[data-asset="fr"]'); await p.click('#ad_check'); await p.click('#ac_save');
  assert(/Tap Working/.test(await p.textContent('#ac_err')), 'asset check needs a status');
  await p.click('[data-st="repair"]'); await p.fill('#ac_note','door seal loose'); await p.click('#ac_save');
  av = (await p.textContent('#assetsView')).replace(/\s+/g,' ');
  assert(/Needs repair/.test(av) && !/check due/.test(av), 'fridge needs repair, check no longer due');
  // dashboard attention + badge
  await E(p, `showView('dashboard')`);
  const at = (await p.textContent('#attnBox')).replace(/\s+/g,' ');
  assert(/Needs attention today/.test(at) && /running low/.test(at) && /Opening check found 1 problem/.test(at) && /Fridge: Needs repair/.test(at), 'dashboard needs-attention card: '+at);
  assert(+(await p.textContent('nav.tabs button[data-v="dashboard"] .navbadge'))>=4, 'number on the Dashboard tab');
  await p.click('[data-attn="stock"]'); assert(await E(p, `recSub`)==='stock', 'tapping goes to Stock');
  // editor
  await E(p, `showView('records'); switchRecordsSub('assets');`);
  await p.click('#chk_edit'); await p.fill('[data-f="name"][data-i="0"]','Morning'); await p.fill('[data-f="items"][data-i="0"]','Gas OK\nFridge OK'); await p.click('#ce_save');
  r = await E(p, `[settings.checklists[0].name, settings.checklists[0].items.length, settings.checklists.length]`);
  assert(JSON.stringify(r)==='["Morning",2,3]', 'checklist edited: '+JSON.stringify(r));
  await p.screenshot({ path: process.env.S+'/assets_checks.png' });
  await E(p, `showView('records'); switchRecordsSub('stock');`); await p.screenshot({ path: process.env.S+'/stock_smart.png', fullPage:true });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
