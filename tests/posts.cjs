// Posts: catalogue, several posts per person, post per day & shift on the roster.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  const posts = await E(p, 'allPosts()');
  const want = ['Head Chef','Helper Chef','Tandoor Chef','Waiter','Sweeper & Cleaner','CEO','Sales','Marketing','Purchase Manager','Operations Manager','HR','Accountant','Counter Billing','Security Guard'];
  assert(want.every(w => posts.includes(w)), 'all asked-for posts are in the list ('+posts.length+' posts)');
  await E(p, `staff=[]; roster=[]; saveStaff(); saveRoster(); settings.shifts=[{name:'Morning',time:'8-4'},{name:'Evening',time:'4-12'}]; saveSettings(); renderAll(); showView('staff'); openStaffForm(null);`);
  await p.fill('#s_name', 'Ravi'); await p.selectOption('#s_role', 'Waiter');
  await p.click('#s_posts [data-post="Counter Billing"]'); await p.click('#s_posts [data-post="Sweeper & Cleaner"]');
  assert(await p.$('#s_posts [data-post="Waiter"].on.main'), 'main post is ticked and marked');
  await p.screenshot({ path: process.env.S+'/posts_form.png' });
  if(await p.$('#s_salary')) await p.fill('#s_salary', '12000');
  await p.click('#s_save'); await p.waitForTimeout(200);
  const st = await E(p, `JSON.stringify(staff.map(function(s){ return [s.name, s.role, s.roles]; }))`);
  assert(st==='[["Ravi","Waiter",["Waiter","Counter Billing","Sweeper & Cleaner"]]]', 'one person, three posts: '+st);
  // roster: day view, assign with a post
  await E(p, `closeForm(); staffDate=fmtDate(new Date()); rosMode='day'; switchStaffSub('roster'); renderStaffSection();`);
  await p.click('[data-assign="Morning"]'); await p.click('[data-pick]'); await p.waitForSelector('[data-pp]');
  assert((await p.$$('[data-pp]')).length===3, 'asks which post (his three)');
  // Morning: Waiter AND Counter Billing in the same shift (main post starts ticked)
  assert(await p.$('[data-pp="Waiter"].on'), 'main post starts ticked');
  await p.click('[data-pp="Counter Billing"]'); await p.click('#pp_ok'); await p.waitForTimeout(150);
  // Evening: only Waiter
  await p.click('[data-assign="Evening"]'); await p.click('[data-pick]'); await p.click('#pp_ok'); await p.waitForTimeout(150);
  let r = await E(p, `roster.map(function(x){ return x.shift+':'+rPosts(x).join('+'); }).sort().join(',')`);
  assert(r==='Evening:Waiter,Morning:Waiter+Counter Billing', 'one person, two posts in the same morning shift: '+r);
  const txt = (await p.textContent('#rosterView')).replace(/\s+/g,' ');
  assert(/Waiter \+ 🧾 Counter Billing/.test(txt) && /Counter Billing 1/.test(txt) && /Waiter 1/.test(txt), 'name shows both posts; both counted for the shift');
  await p.screenshot({ path: process.env.S+'/posts_roster.png' });
  // change: add Sweeper & Cleaner too, remove Waiter
  const mid = await E(p, `roster.find(function(x){ return x.shift==='Morning'; }).id`);
  await p.click(`[data-rpost="${mid}"]`); await p.click('[data-pp="Sweeper & Cleaner"]'); await p.click('[data-pp="Waiter"]'); await p.click('#pp_ok'); await p.waitForTimeout(150);
  assert(await E(p, `rPosts(roster.find(function(x){ return x.id==='${mid}'; })).join('+')`)==='Counter Billing+Sweeper & Cleaner', 'posts changed from the roster');
  await p.click(`[data-rpost="${mid}"]`); await p.click('[data-pp="Counter Billing"]'); await p.click('[data-pp="Sweeper & Cleaner"]'); await p.click('#pp_ok');
  assert(/at least one post/.test(await p.textContent('#pp_err')), 'cannot leave a shift with no post'); await p.click('#pp_c');
  await E(p, `closeForm(); renderStaffSection();`);
  // week view keeps posts when shifts change, and shows icons
  await E(p, `rosMode='week'; renderStaffSection();`);
  const cell = await p.textContent(`[data-rc][data-rd="${await E(p,'staffDate')}"]`);
  assert(/🧹/.test(cell), 'week box shows the other post icon: '+cell);
  await E(p, `setRosterShifts(staff[0].id, staffDate, ['Morning']); saveRoster();`);
  assert(await E(p, `roster.filter(function(x){ return x.date===staffDate; }).map(function(x){ return rPosts(x).join('+'); }).join()`)==='Counter Billing+Sweeper & Cleaner', 'changing shifts keeps the posts');
  // More than two: a small outlet's all-rounder does 4 posts in one shift, plus one picked from "Other post…"
  await E(p, `staff.push({id:'s2',name:'Mohan',role:'Waiter',roles:['Waiter','Counter Billing','Sweeper & Cleaner','Security Guard'],status:'Active',defaultShift:'Morning'}); saveStaff(); rosMode='day'; renderStaffSection();`);
  await p.click('[data-assign="Morning"]'); await p.click('[data-pick="s2"]'); await p.waitForSelector('[data-pp]');
  for (const n of ['Counter Billing','Sweeper & Cleaner','Security Guard']) await p.click(`[data-pp="${n}"]`);
  await p.click('#pp_more'); await p.click('[data-pp="Delivery Boy"]');
  assert(/Done \(5 posts\)/.test(await p.textContent('#pp_ok')), 'picker counts 5 posts');
  await p.screenshot({ path: process.env.S+'/posts_many.png' });
  await p.click('#pp_ok'); await p.waitForTimeout(150);
  const mo = await E(p, `rPosts(roster.find(function(x){ return x.staffId==='s2'; })).join('+')`);
  assert(mo==='Waiter+Counter Billing+Sweeper & Cleaner+Security Guard+Delivery Boy', 'five posts in one morning shift: '+mo);
  const cov = (await p.textContent('#rosterView')).replace(/\s+/g,' ');
  assert(/Security Guard 1/.test(cov) && /Delivery Boy 1/.test(cov), 'shift counts every post he covers');
  await E(p, `rosMode='week'; renderStaffSection();`);
  const wc = await p.textContent(`[data-rc="s2"][data-rd="${await E(p,'staffDate')}"]`);
  assert(/🧾/.test(wc) && /🧹/.test(wc) && /💂/.test(wc) && /🛵/.test(wc), 'week box shows all the other post icons: '+wc);
  await E(p, `rosMode='day'; renderStaffSection();`);
  // own posts
  await E(p, `openCustomPosts()`); await p.fill('#cp_new', 'Juice Maker'); await p.click('#cp_add'); await p.click('#cp_s'); await p.waitForTimeout(150);
  assert(await E(p, `allPosts().indexOf('Juice Maker')>=0`), 'own post added');
  // staff phones receive the posts
  await p.waitForTimeout(2500);
  await call(p, 'POST', '/api/users', { login:'chef-1', outlet:'rimjhim', name:'Chef', access:'chef', password:'secret123' });
  const c = await (await b.newContext()).newPage(); await c.goto('http://127.0.0.1:8787/');
  await c.evaluate(async () => { await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ login:'chef-1', password:'secret123' }) }); });
  const d = await call(c, 'GET', '/api/data?outlet=rimjhim');
  const sv = d.json.items.staff_v1.value[0], rv = d.json.items.roster_v1.value.find(x => x.post);
  assert(JSON.stringify(sv.roles)==='["Waiter","Counter Billing","Sweeper & Cleaner"]' && sv.salary===undefined && rv && rv.post, 'chef phone sees posts and roster posts, not pay');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
