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
  // setup guide
  await E(p, `menuItems=[]; ingredients=[]; staff=[]; settings.setupDone={}; settings.setupHidden=false; settings.tables=null; settings.upiId=''; saveMenu(); saveIngredients(); saveStaff(); saveSettings(); renderAll(); showView('dashboard');`);
  let t = (await p.textContent('#setupBox')).replace(/\s+/g,' ');
  assert(/Get your cafe ready · 0 of 12/.test(t), 'setup guide shows 0 of 12: '+t.slice(0,80));
  await E(p, `menuItems=[1,2,3,4,5].map(function(i){ return {id:'m'+i,name:'Dish '+i,price:50,active:true}; }); saveMenu(); settings.upiId='x@ok'; saveSettings(); renderAll();`);
  assert(/2 of 12/.test(await p.textContent('#setupBox')), 'menu and UPI ticked automatically');
  await p.click('[data-sumark="pin"]'); await p.waitForTimeout(100);
  assert(/3 of 12/.test(await p.textContent('#setupBox')), 'manual step ticked');
  await p.click('[data-sugo="6"]'); await p.waitForTimeout(150); assert(/Tables/.test(await p.textContent('#sheet h2')), 'Go opens the tables editor'); await E(p, 'closeForm()');
  await p.click('#su_hide'); await p.waitForTimeout(100);
  assert(/Setup guide: 3 of 12 done/.test(await p.textContent('#setupBox')), 'hidden guide leaves a small line');
  await p.click('#su_show'); await p.waitForTimeout(100); assert(/Get your cafe ready/.test(await p.textContent('#setupBox')), 'shown again');
  // Hindi
  await E(p, `localStorage.setItem('app_lang_v1','hi')`); await p.reload(); await p.waitForTimeout(400);
  if(await p.isVisible('#loginBg.on')){ await p.fill('#loginPin','1234'); await p.click('#loginGo'); }
  await p.waitForTimeout(1800);
  const nav = await p.$$eval('nav.tabs button', a => a.map(x => x.textContent.trim()));
  console.log('   '+JSON.stringify(nav));
  assert(nav.indexOf('काउंटर')>=0 && nav.indexOf('रिकॉर्ड')>=0 && nav.indexOf('डैशबोर्ड')>=0, 'bottom tabs in Hindi');
  assert(await p.textContent('#langBtn')==='English', 'switch shows English to go back');
  await E(p, `showView('records'); switchRecordsSub('purchases');`); await p.waitForTimeout(200);
  assert(/ख़रीदारी/.test(await p.textContent('#recordsTitle')), 'Records heading in Hindi: '+await p.textContent('#recordsTitle'));
  await E(p, `showView('counter'); setCounterType('take'); renderCounter();`); await p.waitForTimeout(200);
  const ct = await p.textContent('#counterView');
  assert(/आज के बिल/.test(ct) && /यहीं खाना/.test(ct) && /फोटो दबाकर जोड़ें/.test(ct) && /चालू ऑर्डर \(0\)/.test(ct) && /आज 0 बिल/.test(ct), 'Counter in Hindi incl. counts');
  await E(p, `openForm('purchase')`); await p.waitForTimeout(200);
  const optV = await p.$$eval('select.bi[data-f="category"] option', a => a.slice(0,3).map(x => x.value));
  assert(optV[0]==='Dairy', 'dropdown values unchanged');
  await E(p, 'closeForm()');
  await p.screenshot({ path: process.env.S+'/hindi_counter.png' });
  await p.click('#langBtn'); await p.waitForTimeout(400);
  if(await p.isVisible('#loginBg.on')){ await p.fill('#loginPin','1234'); await p.click('#loginGo'); }
  await p.waitForTimeout(1800);
  const nav2 = await p.$$eval('nav.tabs button', a => a.map(x => x.textContent.trim()));
  assert(nav2.indexOf('Counter')>=0, 'back to English');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
