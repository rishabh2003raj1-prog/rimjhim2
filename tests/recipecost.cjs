// Recipe cost: purchases match whole words (Veggies ≠ Egg), trays / dozens / packs convert to pieces,
// an unknown pack is not guessed, and the dish form shows how each line's cost was found.
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
  await E(p, `var T = fmtDate(new Date());
    ingredients=[{id:'egg',name:'Egg',unit:'pcs',type:'Raw material'},{id:'aata',name:'Aata',unit:'g',type:'Raw material'},{id:'oil',name:'Oil',unit:'g',type:'Raw material'},{id:'paneer',name:'Paneer',unit:'g',type:'Raw material'}];
    purchases=[{id:'p1',date:T,item:'Veggies',qty:1,unit:'kg',rate:220,vendor:'Mandi'},{id:'p2',date:addDays(T,-1),item:'Eggs',qty:2,unit:'tray',rate:210,vendor:'Poultry'},
      {id:'p3',date:addDays(T,-2),item:'Aata 10 kg',qty:1,unit:'kg',rate:40},{id:'p4',date:addDays(T,-2),item:'Oil',qty:1,unit:'tin',rate:2100},{id:'p5',date:addDays(T,-3),item:'Paneer',qty:2,unit:'kg',rate:380}];
    menuItems=[{id:'m1',name:'Egg Paratha',category:'Paratha',price:89,active:true,recipe:[{ingredientId:'egg',qty:2},{ingredientId:'aata',qty:100},{ingredientId:'oil',qty:15}]}];
    saveIngredients(); savePurch(); saveMenu(); renderAll();`);
  const c = await E(p, `JSON.stringify([costPerUnit(ingById('egg')).cost, costPerUnit(ingById('aata')).cost, costPerUnit(ingById('oil')).cost, costPerUnit(ingById('oil')).mismatch, costPerUnit(ingById('paneer')).cost])`);
  assert(c==='[7,0.04,null,true,0.38]', 'egg ₹210/tray = ₹7 a piece (not "Veggies" ₹220), aata ₹40/kg = ₹0.04/g, oil per "tin" not guessed, paneer ₹0.38/g: '+c);
  assert(await E(p, `itemWords("Eggless cake").indexOf("egg")<0 && !purchaseMatches({item:"Veggies"}, {name:"Egg"}) && purchaseMatches({item:"Eggs 1 tray"}, {name:"Egg"})`), 'whole-word match only');
  assert(await E(p, `JSON.stringify([recipePerPurchase({unit:'pcs'},'dozen'), recipePerPurchase({unit:'pcs'},'Tray'), recipePerPurchase({unit:'g'},'kg'), recipePerPurchase({unit:'ml'},'litre'), recipePerPurchase({unit:'g'},'packet'), recipePerPurchase({unit:'g', packSize:500},'packet')])`)==='[12,30,1000,1000,null,500]', 'dozen 12, tray 30, kg 1000 g, litre 1000 ml, packet needs a pack size (500 g)');
  await E(p, `openMenuForm('m1')`); await p.waitForSelector('#m_costbox');
  let box = (await p.textContent('#m_costbox')).replace(/\s+/g,' ');
  assert(/Egg · 2 pcs × ₹7(\.00)?\/pcs/.test(box) && /₹210 per tray \(Eggs/.test(box) && /1 tray = 30 pcs/.test(box) && /₹14/.test(box), 'egg line: 2 pcs × ₹7 = ₹14 from the tray purchase');
  assert(/bought per tin — set how many g are in 1 tin/.test(box) && /no usable purchase rate/.test(box), 'oil: asks for the tin size instead of guessing');
  await p.screenshot({ path: process.env.S+'/recipe_cost.png' });
  // Set the tin size on the ingredient: 1 tin = 15000 g
  await E(p, `closeForm(); openIngredientForm('oil')`); await p.fill('#i_pack', '15000'); await p.click('#i_save'); await p.waitForTimeout(100);
  assert(await E(p, `Math.round(costPerUnit(ingById('oil')).cost*1000)/1000`)===0.14, 'oil tin ₹2,100 / 15,000 g = ₹0.14/g');
  assert(await E(p, `Math.round(recipeCost(menuItems[0]).cost*100)/100`)===20.1, 'Egg paratha: ₹14 + ₹4 + ₹2.10 = ₹20.10');
  // A purchase entered per piece but really a tray: the line is flagged as too high
  await E(p, `purchases.push({id:'p6',date:fmtDate(new Date()),item:'Egg',qty:1,unit:'pcs',rate:220}); savePurch(); openMenuForm('m1')`); await p.waitForSelector('#m_costbox');
  box = (await p.textContent('#m_costbox')).replace(/\s+/g,' ');
  assert(/Looks too high/.test(box) && await p.$('.warnrow'), 'a ₹220 "piece" of egg (₹440 on an ₹89 dish) is flagged');
  await p.screenshot({ path: process.env.S+'/recipe_cost_warn.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
