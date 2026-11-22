const fs = require('fs');
const { chromium } = require(process.env.PW_MODULE || 'playwright');

const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
if(!require('fs').existsSync((process.env.S||'.') + '/RimJhim_Revised_Menu_Import.txt')){ console.log('skip: needs the cafe menu file in $S (kept out of the repo)'); process.exit(0); }
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }

(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `menuItems=[{id:'old1',name:'Hakka Noodles (Full)',category:'Chinese',price:99,veg:'veg',active:true,recipe:[{ingredientId:'x',qty:1}],sop:[{text:'Toss'}],photo:'/api/photos/abc'},{id:'old2',name:'Desi Pasta Old',category:'Pasta',price:90,active:true,recipe:[],sop:[]}];
    saveMenu(); renderAll(); showView('records'); switchRecordsSub('menu');`);
  const text = fs.readFileSync(process.env.S + '/RimJhim_Revised_Menu_Import.txt', 'utf8');
  await p.click('#menu_import'); await p.fill('#mi_text', text); await p.check('#mi_hide'); await p.click('#mi_check');
  const pv = (await p.textContent('#mi_prev')).replace(/\s+/g,' ');
  console.log('   '+pv);
  assert(!/not understood/.test(pv), 'every line understood');
  await p.click('#mi_go'); await p.waitForTimeout(300); const msg = await p.textContent('#dlgMsg'); console.log('   '+msg); await dis();
  const r = await E(p, `(function(){ var h = menuItems.find(function(m){ return m.name==='Hakka Noodles (Full)'; }); return { n: menuItems.filter(function(m){ return m.active!==false; }).length, price:h.price, keptRecipe:h.recipe.length, keptSop:h.sop.length, keptPhoto:h.photo, hidden: menuItems.find(function(m){ return m.id==='old2'; }).active, chick: menuItems.find(function(m){ return m.name==='Chicken Biryani (Full)'; }).veg, egg: menuItems.find(function(m){ return m.name==='Egg Paratha'; }).veg }; })()`);
  console.log('   '+JSON.stringify(r));
  assert(r.price===129 && r.keptRecipe===1 && r.keptSop===1 && r.keptPhoto==='/api/photos/abc', 'existing dish: new price, recipe / SOP / photo kept');
  assert(r.hidden===false && r.chick==='nonveg' && r.egg==='egg', 'old dish hidden; veg / egg / non-veg marks set');
  const t = (await p.textContent('#menuView')).replace(/\s+/g,' ');
  assert(/Off the menu/.test(t) && /Chinese Combos/.test(t) && /Light & Healthy/.test(t), 'grid shows new sections and off-menu group');
  await E(p, `openTally(fmtDate(new Date()))`);
  assert(!/Desi Pasta Old/.test(await p.textContent('#sheet')), 'hidden dish not offered in quick tally');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
