// Hindi mode shows Hindi dish names (saved, else automatic); owner can review and save them.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs, lang){ const ctx = await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 });
  if(lang) await ctx.addInitScript(l => { try{ localStorage.setItem('app_lang_v1', l); }catch(e){} }, lang);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
const MENU = `menuItems=[{id:'a',name:'Aloo Paratha + Tea',category:'Breakfast Combos',price:79,veg:'veg',active:true},{id:'b',name:'Boiled Eggs (2)',category:'Breakfast Combos',price:30,veg:'egg',active:true},
  {id:'c',name:'Mini Thali (dal, sabzi, rice, 3 roti, salad)',category:'Thali',price:119,veg:'veg',active:true},{id:'d',name:'Masala Chai',localName:'मसाला वाली चाय',category:'Tea',price:20,veg:'veg',active:true}];
  ingredients=[{id:'i1',name:'Onion',unit:'kg'}]; liveOrders=[]; saveMenu(); saveIngredients(); saveLive(); counterType='take'; counterCat='__all'; renderAll(); showView('counter');`;
(async () => {
  const b = await chromium.launch(), errs = [];
  // English: no automatic Hindi
  let p = await open(b, errs, 'en'); await E(p, MENU); await p.waitForTimeout(200);
  assert(!(await p.$('[data-add="a"] .cloc')) && /Aloo Paratha/.test(await p.textContent('[data-add="a"]')), 'English mode: English name only');
  assert(/मसाला वाली चाय/.test(await p.textContent('[data-add="d"]')), 'saved Hindi name still shows in English mode');
  await p.context().close();
  // Hindi
  p = await open(b, errs, 'hi'); await E(p, MENU); await p.waitForTimeout(300);
  const t = n => p.textContent('[data-add="'+n+'"] .cloc');
  assert(await t('a')==='आलू पराठा + चाय', 'Aloo Paratha + Tea → '+await t('a'));
  assert(await t('b')==='उबले अंडे (2)', 'Boiled Eggs (2) → '+await t('b'));
  assert(/मिनी थाली \(दाल, सब्ज़ी, चावल, 3 रोटी, सलाद\)/.test(await t('c')), 'Mini Thali → '+await t('c'));
  assert(await t('d')==='मसाला वाली चाय', 'saved Hindi name wins over automatic');
  assert(/Aloo Paratha/.test(await p.textContent('[data-add="a"] .cname')), 'English name stays small underneath');
  const cats = await p.$$eval('.ccats button', a => a.map(x => x.textContent).join('|'));
  assert(/नाश्ता कॉम्बो/.test(cats) && /थाली/.test(cats), 'category chips in Hindi: '+cats);
  await p.screenshot({ path: process.env.S+'/hindinames.png' });
  // Bill sheet and live order show Hindi
  await p.click('[data-add="a"]'); await p.click('#ct_go'); await p.waitForTimeout(300);
  assert(/आलू पराठा \+ चाय/.test(await p.textContent('#sheet')), 'bill shows the Hindi name');
  await E(p, 'closeForm(); counterOrder={}; counterType="dine"; renderCounter();');
  await p.click('[data-table="Table 1"]'); await p.click('[data-add="b"]'); await p.click('#ct_go'); await p.waitForTimeout(200);
  await p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(p, 'openLiveOrders()'); await p.waitForTimeout(200);
  assert(/उबले अंडे/.test(await p.textContent('#sheet')), 'Live orders show the Hindi name');
  await E(p, 'closeForm()');
  // Review sheet: save names
  await E(p, `showView('records'); switchRecordsSub('menu');`); await p.waitForTimeout(200);
  assert(/3 dishes without one/.test(await p.textContent('#menu_hindi')), 'Menu shows how many dishes lack a Hindi name');
  await p.click('#menu_hindi'); await p.waitForSelector('[data-hn]');
  const vals = await p.$$eval('[data-hn]', a => a.map(x => x.value));
  assert(vals.includes('आलू पराठा + चाय') && vals.includes('प्याज़'), 'boxes start with automatic names (dishes and stock): '+vals.join(' | '));
  await p.fill('[data-hn="1"]', 'उबले अंडे (दो)');
  await p.click('#hn_s'); await p.waitForTimeout(200); await p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  const saved = await E(p, `menuItems.map(function(m){ return m.localName||''; }).join('|')+' / '+ingredients[0].localName`);
  assert(saved==='आलू पराठा + चाय|उबले अंडे (दो)|मिनी थाली (दाल, सब्ज़ी, चावल, 3 रोटी, सलाद)|मसाला वाली चाय / प्याज़', 'names saved: '+saved);
  // English phone now shows saved names too
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
