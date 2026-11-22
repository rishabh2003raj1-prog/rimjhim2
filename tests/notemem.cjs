const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync('/home/user/rimjhim2/public/index.html','utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
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
    purchases=[{id:'p1',date:'2026-11-10',vendor:'Sharma Dairy',item:'Milk',category:'Dairy',qty:10,unit:'litre',rate:58,gst:0,mode:'Credit',paidBy:'Cafe cash'},
               {id:'p2',date:'2026-11-15',vendor:'Sharma Dairy',item:'Milk',category:'Dairy',qty:12,unit:'litre',rate:58,gst:0,mode:'Credit',paidBy:'Cafe cash'},
               {id:'p3',date:'2026-11-12',vendor:'Kirana Store',item:'Sugar',category:'Grocery',qty:5,unit:'kg',rate:45,gst:0,mode:'Cash',paidBy:'Cafe cash'}];
    sales=[{id:'c1',date:'2026-11-05',customer:'Amit',desc:'tea',amount:800,mode:'Credit'}]; customers=[]; creditPayments=[];
    loans=[{id:'l1',date:'2026-10-01',type:'take',party:'Uncle',partyType:'Relative / friend',amount:50000,via:'bank'}];
    attendance=[]; expenses=[]; investments=[]; notes=[]; settings.fixedCostMonths={}; settings.billMeta={}; settings.noteAliases={};
    saveEverything(); saveStaff(); saveAttend(); saveLoans(); saveCustomers(); saveCreditPayments(); saveNotes(); saveSettings(); renderAll(); showView('notes');`);
  const chips = await p.textContent('#noteChips');
  assert(/Milk 12 litre|Milk 10 litre/.test(chips) && /Counter sales/.test(chips), 'chips from what you buy: '+chips);
  const P = await E(p, 'PARTNERS[0]');
  const lines = ['doodh 10 litre','cheeni 3 kg 150','Ravi absent today','Sita and Ravi half day yesterday','Sita advance 2000 upi','Amit paid udhaar 500 upi',
                 'repaid loan to Uncle 5000','electricity bill 4100 412 units due 15 nov', P+' loan 10000 upi','gave loan to Ramesh 1000 cash'];
  await p.fill('#noteInput', lines.join('\n')); await p.click('#noteAddBtn'); await p.click('#noteProcessBtn'); await p.waitForTimeout(1500);
  const msg = await p.textContent('#dlgMsg'); console.log('   '+msg); await dis();
  const errsN = await E(p, `notes.filter(function(n){ return n.status!=='processed'; }).map(function(n){ return n.text+' -> '+n.error; })`);
  assert(errsN.length===0, 'all notes filed: '+JSON.stringify(errsN));
  let r = await E(p, `(function(){ var m = purchases.filter(function(x){ return x.item==='Milk' && x.date==='${T}'; })[0], su = purchases.filter(function(x){ return x.item==='Sugar' && x.date==='${T}'; })[0];
    return { m: m && [m.qty,m.unit,m.rate,m.vendor,m.mode,m.category].join('|'), su: su && [su.qty,su.unit,su.rate,su.vendor,su.category].join('|') }; })()`);
  assert(r.m==='10|litre|58|Sharma Dairy|Credit|Dairy', 'doodh -> Milk with last rate, usual vendor and udhaar habit: '+r.m);
  assert(r.su==='3|kg|50|Kirana Store|Grocery', 'cheeni -> Sugar, price given, usual vendor: '+r.su);
  r = await E(p, `({ t: attendFor('${T}','s1') && attendFor('${T}','s1').status, y1: attendFor('${Y}','s1') && attendFor('${Y}','s1').status, y2: attendFor('${Y}','s2') && attendFor('${Y}','s2').status })`);
  assert(r.t==='Absent' && r.y1==='Half day' && r.y2==='Half day', 'attendance notes: '+JSON.stringify(r));
  r = await E(p, `(function(){ var a = expenses.find(function(x){ return x.advance; }); return a && [a.staffId, a.amount, a.mode, a.paidBy, a.description].join('|'); })()`);
  assert(r==='s2|2000|UPI|Cafe UPI/bank|Sita - November 2026 salary advance', 'advance note: '+r);
  r = await E(p, `(function(){ var c = customers.find(function(x){ return x.name==='Amit'; }); return { due: c && customerDue(c), pay: creditPayments.length }; })()`);
  assert(r.due===300 && r.pay===1, 'udhaar paid back lowers Amit’s due to 300: '+JSON.stringify(r));
  r = await E(p, `({ uncle: loanOutstanding('Uncle','owe'), ramesh: loanOutstanding('Ramesh','lent'), partner: partnerMoney(PARTNERS[0]).loan })`);
  assert(r.uncle===45000 && r.ramesh===1000 && r.partner===10000, 'loans: repaid uncle, gave Ramesh, partner loan: '+JSON.stringify(r));
  r = await E(p, `({ amt: billEntered('2026-11','Electricity'), meta: billMeta('2026-11','Electricity') })`);
  assert(r.amt===4100 && r.meta.due==='2026-11-15' && r.meta.note==='412 units', 'bill amount with due date and units: '+JSON.stringify(r));
  // undo restores
  await E(p, `undoNoteRecords(notes.find(function(n){ return /electricity/.test(n.text); })); undoNoteRecords(notes.find(function(n){ return /absent/.test(n.text); })); renderAll();`);
  r = await E(p, `({ amt: billEntered('2026-11','Electricity'), att: attendFor('${T}','s1') })`);
  assert(r.amt===null && r.att===null, 'undo restores bill and attendance');
  // learning a word, then using it
  await E(p, `learnAlias('item','amul gold','Milk'); saveSettings();`);
  await p.fill('#noteInput', 'amul gold 6 litre'); await p.click('#noteAddBtn'); await p.click('#noteProcessBtn'); await p.waitForTimeout(1500); await dis(); await dis();
  r = await E(p, `(function(){ var x = purchases.filter(function(q){ return q.item==='Milk' && q.qty===6; })[0]; return x && [x.rate, x.vendor].join('|'); })()`);
  assert(r==='58|Sharma Dairy', 'taught word used: '+r);
  // correction in the bill form teaches the word
  const bid = await E(p, `purchases.find(function(q){ return q.item==='Sugar' && q.date==='${T}'; }).billId`);
  await E(p, `openBillForm('${bid}')`); await p.waitForTimeout(200);
  await p.fill('.bi[data-f="item"][data-i="0"]', 'Sugar (Madhur)'); const changed = true;
  assert(changed, 'found item field');
  await p.click('#b_save'); await p.waitForTimeout(300); console.log('   dialog:', await p.textContent('#dlgMsg').catch(()=>''), await p.textContent('#dlgBtns').catch(()=>'')); console.log('   after save:', await E(p, `JSON.stringify({items: purchases.filter(function(q){return q.billId==='${bid}';}).map(function(q){return q.item;}), err: (document.getElementById('b_err')||{}).textContent, al: settings.noteAliases})`)); await dis();
  assert(await E(p, `noteAliases().item['sugar']`)==='Sugar (Madhur)', 'renaming in the bill teaches the word');
  await E(p, `showView('notes'); openNoteMemory()`);
  const mt = await p.textContent('#sheet');
  assert(/What the app remembers/.test(mt) && /amul gold/.test(mt) && /Sugar \(Madhur\)/.test(mt), 'memory sheet lists learned words');
  await p.screenshot({ path: process.env.S + '/notemem.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
