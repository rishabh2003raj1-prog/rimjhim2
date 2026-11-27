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
  const PIX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await E(p, `ingredients=[{id:'g1',name:'Milk',unit:'ml',type:'Raw material',minStock:0,openingStock:0,openingDate:'2026-01-01'},{id:'g2',name:'Tea leaves',unit:'g',type:'Raw material',minStock:0,openingStock:0,openingDate:'2026-01-01'},{id:'g3',name:'Sugar',unit:'g',type:'Raw material',minStock:0,openingStock:0,openingDate:'2026-01-01'}];
    purchases=[{id:'p1',date:'2026-11-01',vendor:'Dairy',item:'Milk',qty:10,unit:'litre',rate:60,gst:0,mode:'Cash'},{id:'p2',date:'2026-11-01',vendor:'Kirana',item:'Tea leaves',qty:1,unit:'kg',rate:400,gst:0,mode:'Cash'},{id:'p3',date:'2026-11-01',vendor:'Kirana',item:'Sugar',qty:1,unit:'kg',rate:45,gst:0,mode:'Cash'}];
    menuItems=[]; dishLog=[]; saveIngredients(); savePurch(); saveMenu(); saveDishLog(); renderAll(); showView('records'); switchRecordsSub('menu');`);
  const choosePhoto = async (sel) => { await p.click(sel); const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#dlgBtns button:nth-child(2)')]); await fc.setFiles({ name:'dish.png', mimeType:'image/png', buffer: Buffer.from(PIX.split(',')[1], 'base64') }); await p.waitForTimeout(500); };
  assert(/No dishes yet/.test(await p.textContent('#menuView')), 'empty menu');
  await p.click('#menu_add');
  await choosePhoto('#m_imgadd');
  await p.fill('#m_name','Masala chai'); await p.fill('#m_local','मसाला चाय'); await p.fill('#m_cat','Tea & coffee'); await p.fill('#m_price','20');
  await p.fill('#m_portion','150 ml cup'); await p.fill('#m_time','5');
  for(const [id, q] of [['g1','100'],['g2','3'],['g3','10']]){
    await p.click('#m_adding'); const n = await p.$$eval('.ri[data-f="ingredientId"]', x => x.length) - 1;
    await p.selectOption('.ri[data-f="ingredientId"][data-i="'+n+'"]', id); await p.fill('.ri[data-f="qty"][data-i="'+n+'"]', q); await p.dispatchEvent('.ri[data-f="qty"][data-i="'+n+'"]', 'change');
  }
  await p.click('#m_newing'); await p.fill('#ni_name','Ginger'); await p.selectOption('#ni_unit','g'); await p.click('#ni_add');
  const gi = await p.$$eval('.ri[data-f="qty"]', x => x.length) - 1; await p.fill('.ri[data-f="qty"][data-i="'+gi+'"]','2');
  await p.fill('.sopt[data-i="0"]','Boil 100 ml water with crushed ginger for 1 minute');
  await p.click('#m_addstep'); await p.fill('.sopt[data-i="1"]','Add tea leaves, milk and sugar; boil twice and strain');
  await choosePhoto('[data-sopph="1"]');
  const costTxt = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Ingredient cost per plate ?₹7\.65/.test(costTxt) && /Food cost ?38% of price/.test(costTxt) && /Price for a 30% food cost ?₹30/.test(costTxt), 'cost 7.65, 38%, suggested ₹30: '+costTxt.match(/Ingredient cost[^R]*/));
  await p.click('#m_save'); await p.waitForTimeout(300);
  let t = (await p.textContent('#sheet')).replace(/\s+/g,' ');

  assert(/Masala chai/.test(t) && /मसाला चाय/.test(t) && /How to make it \(SOP\)/.test(t) && /Boil 100 ml water/.test(t), 'recipe card after save');
  await p.fill('#rc_plates','10'); await p.dispatchEvent('#rc_plates','change');
  t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Milk ?1,?000 ml/.test(t) && /Tea leaves ?30 g/.test(t), 'recipe scaled to 10 plates');
  const m = await E(p, `JSON.parse(JSON.stringify(menuItems[0]))`);
  assert(m.recipe.length===4 && m.sop.length===2 && m.veg==='veg' && m.localName==='मसाला चाय' && m.portion==='150 ml cup', 'dish saved with recipe, SOP, local name, portion');
  assert(await E(p, `ingredients.some(function(g){ return g.name==='Ginger'; })`), 'new ingredient added to stock from the dish form');
  // photos uploaded
  for(let i=0;i<30;i++){ const ok = await E(p, `!!(menuItems[0] && /^\\/api\\/photos\\//.test(menuItems[0].photo||'') && /^\\/api\\/photos\\//.test((menuItems[0].sop[1]||{}).photo||''))`); if(ok) break; await p.waitForTimeout(500); }
  const ph = await E(p, `[menuItems[0].photo, menuItems[0].sop[1].photo]`);
  assert(/^\/api\/photos\//.test(ph[0]) && /^\/api\/photos\//.test(ph[1]), 'dish photo and SOP step photo uploaded: '+ph.map(x=>String(x).slice(0,20)));
  // grid + readiness
  await E(p, `purchases.push({id:'p4',date:'2026-11-01',vendor:'Sabzi',item:'Ginger',qty:1,unit:'kg',rate:100,gst:0,mode:'Cash'}); savePurch(); closeForm(); renderAll();`);
  t = (await p.textContent('#menuView')).replace(/\s+/g,' ');
  assert(/1 of 1 dishes ready/.test(t) && /Masala chai/.test(t) && /39%/.test(t), 'menu grid with readiness and food cost (39% with ginger priced)');
  assert(/1 dish · 1 ready/.test(await p.textContent('#recordsTotalLbl')), 'heading shows readiness');
  assert(/costs more than 35%/.test(t), 'warning for dishes above target');
  // second dish + sales for analysis and prep
  const today = await E(p, 'fmtDate(new Date())');
  await E(p, `menuItems.push({id:'sam',name:'Samosa',category:'Snacks',price:15,veg:'veg',recipe:[{ingredientId:'g3',qty:5}],sop:[{text:'Fry'}],photo:null});
    dishLog=[{id:'d1',date:addDays('${today}',-7),menuId:menuItems[0].id,qty:30},{id:'d2',date:addDays('${today}',-14),menuId:menuItems[0].id,qty:20},{id:'d3',date:addDays('${today}',-3),menuId:'sam',qty:5}];
    saveMenu(); saveDishLog(); renderAll();`);
  assert(await E(p, `expectedPlates(menuItems[0].id, '${today}')`)===13, 'expected chai plates from the same weekday (30+20+0+0)/4 → 13');
  await p.click('#menu_prep');
  t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Plates to expect/.test(t) && /Milk ?in stock 5,?000 ml ?1,?300 ml/.test(t), 'prep list: 1,300 ml milk needed, 5,000 in stock (after 50 plates sold): '+(t.match(/Milk[^T]*/)||[''])[0]);
  await p.fill('.pl_q[data-id="sam"]','40'); await p.dispatchEvent('.pl_q[data-id="sam"]','change');
  t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Sugar ?in stock [\d,]+ g ?330 g/.test(t), 'changing plates updates ingredients (130+200 g sugar)');
  await E(p, 'closeForm()');
  await p.click('#menu_eng');
  t = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/Menu analysis/.test(t) && /Stars/.test(t) && /Price check/.test(t) && /Masala chai/.test(t) && /try ₹30/.test(t), 'menu analysis + price check');
  const cls = await E(p, `menuAnalysis(30).rows.map(function(r){ return r.m.name+':'+r.cls; }).join()`);
  assert(/Masala chai:(star|plowhorse)/.test(cls) && /Samosa:(dog|puzzle)/.test(cls), 'dishes classified: '+cls);
  await E(p, 'closeForm()');
  // recipe book PDF
  await p.click('#menu_book');
  const dl = p.waitForEvent('download', { timeout: 15000 }).catch(()=>null); await p.click('#rb_go'); const d = await dl;
  if(d) await d.saveAs(process.env.S + '/recipes.pdf');
  assert(!!d, 'recipe & SOP book PDF created');
  // kitchen view hides costs; billing can't edit
  await E(p, `closeForm(); cloud.who = { role:'store', access:'chef', login:'c', perms:{ menu_v1:'rw', ingredients_v1:'rw', purchases_v1:'append' } }; openRecipeCard(menuItems[0].id);`);
  t = await p.textContent('#sheet');
  assert(!/Food cost|Cost \/ plate|Earns/.test(t) && /Edit dish/.test(t), 'chef sees recipe and SOP, not costs, and can edit');
  await E(p, `cloud.who = { role:'store', access:'billing', login:'b', perms:{ menu_v1:'r', sales_v1:'append2' } }; openRecipeCard(menuItems[0].id);`);
  assert(!/Edit dish/.test(await p.textContent('#sheet')), 'billing can view but not edit dishes');
  await E(p, `cloud.who = null; closeForm(); renderAll(); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/menu_grid.png' });
  await E(p, `openRecipeCard(menuItems[0].id)`); await p.screenshot({ path: process.env.S + '/recipe_card.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
