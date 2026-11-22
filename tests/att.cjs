const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
(async () => {
  const b = await chromium.launch(); const errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
  await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  await E(p, `staff=[{id:'a1',name:'Rohit Chhotu',role:'Helper',salary:10000,status:'Active',joinDate:'2026-07-15'},
                     {id:'g1',name:'Gurfan',role:'Helper',salary:12000,status:'Active',joinDate:'2026-09-04'},
                     {id:'s1',name:'Suresh Kumar',role:'Helper',salary:9000,status:'Active',joinDate:'2026-10-05'}];
    attendance=[];
    for(var d=1; d<=25; d++) setAttendanceOn('2026-09-'+String(d).padStart(2,'0'),'a1','Present');
    for(var d=3; d<=30; d++) setAttendanceOn('2026-09-'+String(d).padStart(2,'0'),'g1','Present');
    saveStaff(); saveAttend(); attMonth='2026-09'; attMode='month'; renderAll();`);
  await p.click('nav.tabs button[data-v="staff"]'); await p.click('#staffCtl button[data-s="attendance"]'); await p.waitForTimeout(300);
  await E(p, `attMonth='2026-09'; attMode='month'; renderAttendView();`);
  const cards = await p.$$eval('.attmonth', els => els.map(e => e.innerText.replace(/\n/g,' | ')));
  cards.forEach(c => console.log('   ' + c.slice(0, 330)));
  assert(/27 present/.test(cards[1]) && /₹10,800 salary/.test(cards[1]), 'Gurfan: counts match pay (27 days from 4 Sep = 10,800)');
  assert(/Set joining date to 3 Sept?/.test(cards[1]), 'warns 3 Sep marked before joining date');
  assert(/5 not marked/.test(cards[0]) && /paid as worked/.test(cards[0]), 'Rohit: 26-30 unmarked flagged');
  assert(/Not employed in September 2026/.test(cards[2]), 'Suresh: not employed in September');
  await p.screenshot({ path: process.env.S + '/att1.png', fullPage: true });
  await p.click('[data-amjoin="g1"]'); await p.click('#dlgBtns .dlgyes'); await p.waitForTimeout(300);
  await E(p, `attMonth='2026-09'; renderAttendView();`);
  const g = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('g1'),'2026-09'))`));
  assert(g.employedDays === 28 && g.salaryNet === 11200 && g.present === 28, 'after fixing joining date: 28 days = 11,200');
  await p.click('[data-amfill="a1"][data-amst="Absent"]'); await p.waitForTimeout(300);
  const r = JSON.parse(await E(p, `JSON.stringify(salaryFor(staffById('a1'),'2026-09'))`));
  console.log('   Rohit after marking 26-30 absent:', r.absent, 'absent, net', r.salaryNet);
  assert(r.absent === 5 && r.salaryNet === 9000, 'Rohit: 5 absent, 2 paid leave, 3 deducted');
  await E(p, `attMonth='2026-09'; renderAttendView();`);
  await p.screenshot({ path: process.env.S + '/att2.png', fullPage: true });
  console.log('errors', errs); await b.close();
})();
