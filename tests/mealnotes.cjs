const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
const _d = (o) => { const x = new Date(Date.now() + o*86400000); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const T = _d(0), Y = _d(-1), YLBL = new Date(Date.now()-86400000).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:3000 }).catch(()=>{});
  await E(p, `staff=[{id:'s1',name:'Ravi',role:'Cook',salary:10000,joinDate:'2025-01-01',status:'Active'},{id:'s2',name:'Sita',role:'Helper',salary:9000,joinDate:'2025-01-01',status:'Active'}];
    settings.mealTypes = mealTemplate(); settings.mealWeek = mealTemplateWeek(); settings.mealDays = {}; notes=[]; purchases=[];
    saveStaff(); saveSettings(); saveNotes(); savePurch(); renderAll(); showView('notes');`);
  await p.fill('#noteInput', ['Staff dinner chicken biryani 6 people today','staff lunch aloo paratha yesterday','staff ate egg curry on 4 nov','no staff meal on 3 Nov','Staff chicken lunch on 1 Nov','1.5 kg chicken Rs 360 from meat shop'].join('\n'));
  await p.click('#noteAddBtn'); await p.click('#noteProcessBtn'); await p.waitForTimeout(1500);
  const msg = await p.textContent('#dlgMsg'); console.log('   ' + msg); await dis();
  assert(/5 staff meals/.test(msg) && /1 purchase/.test(msg), 'five staff meal notes + one purchase filed');
  let r = await E(p, `(function(){ function d(x){ var dp = mealDayPlan(x); return dp.slots.map(function(s){ return (s.meal? s.meal.id : '-')+':'+s.people; }).join(','); }
     return { today:d('${T}'), yest:d('${Y}'), nov4:d('2026-11-04'), nov3:d('2026-11-03'), nov1:d('2026-11-01'), purch:purchases.length }; })()`);
  console.log('   ' + JSON.stringify(r));
  assert(/,ml_biryani:6$/.test(r.today), 'dinner biryani for 6 today');
  assert(/^ml_aloo:2,/.test(r.yest), 'lunch aloo paratha yesterday, people from attendance (2)');
  assert(/,ml_egg:2$/.test(r.nov4), 'egg on 4 Nov (dinner by default)');
  assert(r.nov3==='-:2,-:2' && await E(p, `mealDayPlan('2026-11-03').cost`)===0, 'no staff meal on 3 Nov');
  assert(/^ml_chicken:2,/.test(r.nov1), 'chicken (not biryani) for lunch 1 Nov');
  assert(r.purch===1, 'a plain chicken purchase stays a purchase');
  // undo the biryani note -> today back to weekly menu
  await E(p, `undoNoteRecords(notes.find(function(n){ return /biryani/.test(n.text); })); renderAll();`);
  assert(!(await E(p, `!!(settings.mealDays||{})['${T}']`)) && (await E(p, `mealDayPlan('${T}').slots[1].mealId === settings.mealWeek.days[String(parseDate('${T}').getDay())][1]`)), 'undo restores the weekly menu');
  // note sheet shows what it filed + open goes to meals
  const nid = await E(p, `notes.find(function(n){ return /aloo/.test(n.text); }).id`);
  await E(p, `openNoteSheet('${nid}')`);
  assert(new RegExp('Staff meals · '+YLBL+' · Aloo paratha \\(2\\)').test(await p.textContent('#sheet')), 'note sheet shows the staff meal');
  await p.click('#ne_open');
  assert(await E(p,'staffSub')==='meals' && await E(p,'staffDate')===Y, 'open goes to Staff → Meals on that day');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
