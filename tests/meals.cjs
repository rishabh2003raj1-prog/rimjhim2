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
  const dis = () => p.click('#dlgBtns button', { timeout:1500 }).catch(()=>{});
  await E(p, `staff=[{id:'s1',name:'Ravi',role:'Cook',salary:10000,joinDate:'2025-01-01',status:'Active'},{id:'s2',name:'Sita',role:'Helper',salary:9000,joinDate:'2025-01-01',status:'Active'},
                     {id:'s3',name:'Mohan',role:'Waiter',salary:9000,joinDate:'2025-01-01',status:'Active'}];
    attendance=[{id:'a1',date:'2026-11-04',staffId:'s3',status:'Absent'}];
    purchases=[{id:'p1',date:'2026-10-20',vendor:'Kirana',item:'Rice',qty:25,unit:'kg',rate:50,gst:0,mode:'Cash'},{id:'p2',date:'2026-10-20',vendor:'Kirana',item:'Atta',qty:10,unit:'kg',rate:40,gst:0,mode:'Cash'},
               {id:'p3',date:'2026-10-21',vendor:'Meat shop',item:'Chicken',qty:1.5,unit:'kg',rate:240,gst:0,mode:'Cash'},{id:'p4',date:'2026-10-22',vendor:'Kirana',item:'Eggs',qty:30,unit:'pcs',rate:7,gst:0,mode:'Cash'}];
    settings.mealTypes=null; settings.mealWeek=null; settings.mealDays={}; settings.mealBasics=0;
    saveStaff(); saveAttend(); savePurch(); saveSettings(); staffDate='2026-11-01'; renderAll(); showView('staff'); switchStaffSub('meals');`);
  let t = await p.textContent('#mealsView');
  assert(/Set up staff meals/.test(t), 'setup card shown first');
  await p.click('#ml_start'); await dis();
  // Sunday 1 Nov 2026: meal1 veg, meal2 chicken; 3 eating
  let r = await E(p, `(function(){ var d = mealDayPlan('2026-11-01'); return { m1:d.slots[0].meal.name, m2:d.slots[1].meal.name, n:d.slots[0].people, c2:d.slots[1].cost, miss:d.slots[1].missing }; })()`);
  // chicken: 1.5*240=360 + rice 0.08*50*3=12 + atta 0.08*40*3=9.6 => 381.6
  assert(r.m2==='Chicken + rice / roti' && r.n===3 && r.c2===381.6, 'Sunday chicken for 3 from purchase rates: '+JSON.stringify(r));
  // Wednesday 4 Nov: egg day, Mohan absent -> 2 people: eggs 2*7*2=28 + rice 8 + atta 6.4 + onion (no rate) 0
  r = await E(p, `(function(){ var d = mealDayPlan('2026-11-04'); return { m2:d.slots[1].meal.name, n:d.slots[1].people, c:d.slots[1].cost, miss:d.slots[1].missing }; })()`);
  assert(r.n===2 && r.c===42.4 && r.miss.indexOf('Onion')>=0, 'egg day, absent staff not counted, missing onion rate flagged: '+JSON.stringify(r));
  // basics per plate
  await E(p, `renderStaffSection()`); await p.click('#ml_settings'); await p.fill('#ms_basics','6'); await p.click('#ms_save');
  r = await E(p, `mealDayPlan('2026-11-01').slots[1].cost`);
  assert(r===399.6, 'oil/masala ₹6 x 3 plates added: '+r);
  // change a day: guest -> 4 people, meal 1 aloo paratha
  await E(p, `staffDate='2026-11-02'; renderStaffSection();`);
  await p.click('#ml_day'); await p.selectOption('.md_meal[data-i="0"]','ml_aloo'); await p.fill('.md_people[data-i="0"]','4'); await p.click('#md_save');
  r = await E(p, `(function(){ var d = mealDayPlan('2026-11-02'); return { m:d.slots[0].meal.name, n:d.slots[0].people, auto:d.slots[0].auto, n2:d.slots[1].people }; })()`);
  assert(r.m==='Aloo paratha' && r.n===4 && !r.auto && r.n2===3, 'day change: aloo for 4, meal 2 still from attendance');
  // month totals + per person
  r = await E(p, `(function(){ var m = mealPlanMonth('2026-10'); var n = mealPlanMonth('2026-11'); return { oct:m.cost, novPlates:n.plates, nov:n.cost, ravi:mealPlanMonth('2026-11','s1').cost, mohan:mealPlanMonth('2026-11','s3').cost }; })()`);
  assert(r.nov>0 && r.ravi>r.mohan && r.ravi>0, 'month cost and per person (absent day lowers Mohan): '+JSON.stringify(r));
  assert(await E(p, `staffMealCost('2026-11','s1')`)===r.ravi, 'staff cost breakdown uses meal plan');
  // edit chicken: 2 kg
  await p.click('[data-mledit="ml_chicken"]'); await p.fill('.mt_qty[data-i="0"]','2'); await p.click('#mt_save');
  r = await E(p, `mealDayPlan('2026-11-01').slots[1].cost`);
  assert(r===399.6+120, 'chicken 2 kg: +120: '+r);
  t = (await p.textContent('#mealsView')).replace(/\s+/g,' ');
  assert(/Weekly menu/.test(t) && /Meal types/.test(t) && /Food cost/.test(t) && /By person/.test(t), 'view sections');
  await E(p, `staffDate='2026-11-01'; renderStaffSection(); window.scrollTo(0,0)`);
  await p.screenshot({ path: process.env.S + '/meals.png', fullPage:true });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
