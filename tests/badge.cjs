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
  await E(p, `checks=[]; settings.checklists=null; ingredients=[]; pos=[]; assets=[]; saveChecks(); renderAll(); showView('records');`);
  const now = await E(p, `nowHM()`);
  const n1 = await E(p, `attentionItems().length`);
  assert(n1===0, 'no checklists used yet: no missed-check warnings ('+now+')');
  assert(!(await p.$('nav.tabs button[data-v="records"] .navbadge')), 'no number on Records');
  await E(p, `checks=[{id:'k',kind:'list',listId:'close',listName:'Closing',date:addDays(fmtDate(new Date()),-1),time:'23:00',items:[]}]; saveChecks(); assets=[{id:'a',name:'Fridge',maintenance:[],checkEvery:1}]; saveAssets(); renderAll();`);
  const n2 = await E(p, `attentionItems().length`);
  const badge = await p.$('nav.tabs button[data-v="dashboard"] .navbadge');
  assert(n2>=1 && badge && +(await badge.textContent())===n2, 'number shown on the Dashboard tab: '+n2);
  assert(!(await p.$('nav.tabs button[data-v="records"] .navbadge')), 'still nothing on Records');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
