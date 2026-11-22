const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true}]; liveOrders=[]; settings.tables=null; saveMenu(); saveLive(); saveSettings(); try{ localStorage.setItem('counter_type_v1','zomato'); }catch(e){} counterType='zomato'; renderAll(); showView('counter');`);
  const types = await p.$$eval('.ctype button', a => a.map(x => x.getAttribute('data-ctype')));
  assert(JSON.stringify(types)==='["dine","take","delivery"]', 'Zomato and Swiggy gone: '+JSON.stringify(types));
  assert(await E(p, 'counterType')==='take', 'phone that used Zomato falls back to Takeaway');
  await p.click('[data-ctype="dine"]');
  assert(await p.$('#ct_tables'), 'Edit tables button next to the tables');
  // open order on Table 1 cannot be removed
  await p.click('[data-table="Table 1"]'); await p.click('.ctile[data-add="chai"]'); await p.click('#ct_go'); await p.waitForTimeout(150); await dis();
  await p.click('#ct_tables');
  assert(await p.$eval('[data-tn="0"]', e => e.disabled) && !(await p.$('[data-tr="0"]')), 'table with an open order is locked');
  await p.fill('[data-tn="1"]', 'Window'); await p.click('[data-tr="6"]'); await p.click('#tb_add'); await p.click('[data-tu="1"]');
  await p.fill('[data-tn="2"]', 'Window'); await p.click('#tb_s');
  assert(/same name/.test(await p.textContent('#tb_err')), 'duplicate names refused');
  await p.fill('[data-tn="2"]', 'Table 3'); await p.click('#tb_s'); await p.waitForTimeout(150);
  const t = await E(p, 'settings.tables');
  console.log('   '+JSON.stringify(t));
  assert(JSON.stringify(t)==='["Window","Table 1","Table 3","Table 4","Outside 1","Outside 2","Table 2"]', 'renamed, removed, added, reordered');
  const chips = await p.$$eval('[data-table]', a => a.map(x => x.getAttribute('data-table')));
  assert(JSON.stringify(chips)===JSON.stringify(t), 'Counter shows the new tables');
  await p.click('#ct_upi'); assert(!/Zomato|Swiggy/.test(await p.textContent('#sheet')), 'no Zomato / Swiggy in Settings');
  await p.click('#up_tables'); assert(/Tables · टेबल/.test(await p.textContent('#sheet h2')), 'Edit tables also in Settings');
  await p.click('#tb_c'); await p.waitForTimeout(100); assert(/Counter settings/.test(await p.textContent('#sheet h2')), 'back to Settings');
  await E(p, 'closeForm()'); await p.click('#ct_tables'); await p.waitForTimeout(300); await p.screenshot({ path: process.env.S+'/tables_edit.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
