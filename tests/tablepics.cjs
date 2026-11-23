const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  await E(p, `menuItems=[{id:'chai',name:'Masala Chai',category:'Tea',price:20,active:true}]; liveOrders=[]; settings.tables=['Indoor Table 1','Indoor Table 2','Outdoor Table 1','Garden','Window 5']; settings.tableZones=null; saveMenu(); saveLive(); saveSettings(); counterType='dine'; renderAll(); showView('counter');`);
  const z = await p.$$eval('[data-table]', a => a.map(x => [x.getAttribute('data-table'), x.classList.contains('out')?'out':'in', x.querySelector('.tpic b').textContent, x.querySelector('.tzone').textContent, !!x.querySelector('.tpic svg')]));
  console.log('   '+JSON.stringify(z));
  assert(z.map(r=>r[1]).join()==='in,in,out,out,in', 'indoor / outdoor guessed from the name');
  assert(z.map(r=>r[2]).join()==='1,2,1,G,5', 'big number badge on each picture');
  assert(z[0][3]==='अंदर · Indoor' && z[2][3]==='बाहर · Outdoor', 'Hindi zone label');
  assert(z.every(r=>r[4]), 'every table has a picture');
  assert(/खाली/.test(await p.textContent('[data-table="Garden"]')), 'free table says खाली');
  // running order shows the amount
  await p.click('[data-table="Indoor Table 2"]'); await p.click('.ctile[data-add="chai"]'); await p.click('#ct_go'); await p.waitForTimeout(150); await dis();
  assert(/₹\s?20/.test(await p.textContent('[data-table="Indoor Table 2"] .tbusy')), 'busy table shows its running amount');
  await p.screenshot({ path: process.env.S+'/tablepics.png' });
  // editor toggle
  await p.click('#ct_tables');
  assert(await p.$('.tzbtn.out[data-tz="3"]'), 'editor shows outdoor picture for Garden');
  await p.click('[data-tz="4"]'); await p.waitForTimeout(80);
  assert(await p.$('.tzbtn.out[data-tz="4"]'), 'tap switches Window 5 to outdoor');
  await p.fill('[data-tn="4"]', 'Window 6');
  await p.screenshot({ path: process.env.S+'/tablepics_edit.png' });
  await p.click('#tb_s'); await p.waitForTimeout(150);
  const tz = await E(p, 'settings.tableZones'); console.log('   '+JSON.stringify(tz));
  assert(tz['Window 6']==='out' && tz['Indoor Table 1']==='in' && tz['Garden']==='out', 'zones saved (follow a rename)');
  assert(await p.$('[data-table="Window 6"].out'), 'Counter shows the switched table as outdoor');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
