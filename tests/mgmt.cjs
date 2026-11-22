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
  await E(p, `(function(){ var T = fmtDate(new Date()), Y = addDays(T,-1);
    sales=[]; var n=0; function S(d,amt,mode,extra){ sales.push(Object.assign({id:'s'+(n++),date:d,customer:'Counter',amount:amt,gst:0,mode:mode},extra||{})); }
    [1,2,3,4].forEach(function(w){ S(addDays(T,-7*w),2000,'UPI'); S(addDays(Y,-7*w),2000,'UPI'); });
    S(Y,500,'UPI');
    S(T,500,'Cash',{order:{no:1,items:[]}}); S(T,300,'UPI',{order:{no:2,items:[]}}); S(T,200,'Credit',{customer:'Sharma ji',order:{no:3,items:[],subtotal:250,discount:50}});
    for(var i=0;i<7;i++) S(addDays(T,-2),200,'Cash',{by:'bill-1',order:{no:10+i,items:[],subtotal:250,discount:50,byName:'Raju'}});
    [3,4,5].forEach(function(k){ S(addDays(T,-k),1000,'Cash'); });
    cashDays=[3,4,5].map(function(k){ return {id:'c'+k,date:addDays(T,-k),counted:0,floatLeft:0,incharge:'Raju'}; });
    purchases=[{id:'p1',date:addDays(T,-60),vendor:'Sharma',item:'Paneer',qty:1,unit:'kg',rate:300},{id:'p2',date:addDays(T,-40),vendor:'Sharma',item:'Paneer',qty:1,unit:'kg',rate:300},
      {id:'p3',date:addDays(T,-20),vendor:'Sharma',item:'Paneer',qty:1,unit:'kg',rate:305},{id:'p4',date:addDays(T,-3),vendor:'Sharma',item:'Paneer',qty:1,unit:'kg',rate:360},
      {id:'p5',date:addDays(T,-60),vendor:'Dairy',item:'Milk',qty:1,unit:'litre',rate:60}];
    ingredients=[{id:'mk',name:'Milk',unit:'ml',openingStock:100000,openingDate:addDays(T,-90)}];
    wastage=[{id:'w0',date:addDays(T,-2),ingredientId:'mk',qty:10000,reason:'Spoiled / expired'}].concat([1,2,3,4].map(function(i){ return {id:'w'+i,date:addDays(T,-7*i-2),ingredientId:'mk',qty:1000,reason:'Spoiled / expired'}; }));
    checks=[1,2,3].map(function(i){ return {id:'v'+i,kind:'void',date:addDays(T,-1),time:'12:0'+i,billNo:i,amount:100,byName:'Raju'}; });
    staff=[{id:'st1',name:'Ravi',status:'Active'}]; attendance=[{id:'a1',staffId:'st1',date:T,status:'Absent'}];
    menuItems=[{id:'chai',name:'Masala Chai',price:20,active:true}]; dishLog=[1,2,3].map(function(w){ return {id:'d'+w,date:addDays(addDays(T,1),-7*w),menuId:'chai',qty:30}; });
    saveSales(); saveCashDays(); savePurch(); saveIngredients(); saveWastage(); saveChecks(); saveStaff(); saveAttend(); saveMenu(); saveDishLog();
    PATTERN_CACHE.at=0; renderAll(); showView('dashboard'); })()`);
  const kinds = await E(p, `patternAlerts().map(function(x){ return x.kind; }).sort().join()`);
  assert(kinds==='cash,disc,price,sales,void,waste', 'all six pattern alerts found: '+kinds);
  const pa = await E(p, `patternAlerts().map(function(x){ return x.t; }).join(' | ')`);
  console.log('   '+pa);
  assert(/Cash short 3 times in 30 days with Raju/.test(pa), 'cash shortages tied to the person in charge');
  assert(/Paneer now ₹360\/kg from Sharma, 19% above the usual ₹301\.67|Paneer now ₹360\/kg from Sharma, 19% above/.test(pa), 'paneer price jump');
  assert(/Raju gave ₹350 discount on 7 bills/.test(pa), 'heavy discounts by one login');
  const mg = (await p.textContent('#mgmtBox')).replace(/\s+/g,' ');
  assert(/Daily summary/.test(mg) && /Tomorrow/.test(mg) && /Masala Chai 23/.test(mg) && /Watch out/.test(mg), 'dashboard card: summary button, tomorrow, watch-outs');
  assert(/Cash short/.test(await p.textContent('#attnBox')), 'patterns also in Needs attention');
  await E(p, `window.__wa=[]; window.open=function(u){ window.__wa.push(decodeURIComponent(u)); }`);
  await p.click('#mg_sum');
  const sum = await p.textContent('.sumtext');
  console.log(sum.split('\n').map(x=>'   | '+x).join('\n'));
  assert(/Sales ₹1,000 · 3 bills/.test(sum) && /Cash ₹500 · UPI ₹300 · Udhaar ₹200 · discounts ₹50/.test(sum), 'summary: sales, bills, modes, discounts');
  assert(/Cash not counted yet/.test(sum) && /Ravi \(absent\)/.test(sum) && /Watch out:/.test(sum) && /Tomorrow: top Masala Chai 23/.test(sum), 'summary: cash, absent staff, watch-outs, tomorrow');
  await p.click('#ds_wa'); assert(/Sales ₹1,000/.test(await E(p, 'window.__wa[0]')), 'sent to WhatsApp');
  await p.click('[data-sd]:nth-child(2)'); const ysum = await p.textContent('.sumtext');
  assert(/Sales ₹500/.test(ysum) && /3 bills cancelled/.test(ysum), "yesterday's summary shows cancelled bills");
  await p.screenshot({ path: process.env.S+'/summary.png' });
  await E(p, 'closeForm()');
  // a cancelled counter bill is logged
  await E(p, `openCounterBills(fmtDate(new Date()))`); await p.click('[data-void]'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(200);
  const v = await E(p, `checks.filter(function(c){ return c.kind==='void' && c.date===fmtDate(new Date()); }).map(function(c){ return [c.billNo, c.amount]; })`);
  assert(v.length===1, 'cancelling a bill leaves a record: '+JSON.stringify(v));
  assert(/Bill \d cancelled/.test(await p.textContent('#sheet')), "cancelled bill shown in today's bills");
  await E(p, 'closeForm(); showView("dashboard")'); await p.screenshot({ path: process.env.S+'/dash_mgmt.png', fullPage:true });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
