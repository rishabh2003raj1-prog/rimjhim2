// Staff details (address, ID, age, joining time, bonus, paid leave, duty hours, scope, lock-in, notice) and
// attendance with face + location check (fake camera / GPS; the face numbers are stubbed, the real face-api is loaded once).
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs'), zlib = require('zlib');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
function png(){ // tiny valid PNG (8x8 grey)
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++){ c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xFFFFFFFF; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(ty), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(8,0); ih.writeUInt32BE(8,4); ih[8]=8; ih[9]=0;
  const raw = Buffer.alloc(8*9, 128); for (let y = 0; y < 8; y++) raw[y*9] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
(async () => {
  const b = await chromium.launch({ args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] }), errs = [];
  const ctx = await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2, permissions:['camera','geolocation'], geolocation:{ latitude:28.61390, longitude:77.20900, accuracy:15 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  const dis = () => p.click('#dlgBtns button', { timeout:2500 }).catch(()=>{});
  await E(p, `staff=[]; attendance=[]; checkins=[]; roster=[]; settings.outletLoc=null; saveStaff(); saveAttend(); saveSettings(); renderAll(); showView('staff');`);
  // ---- Staff details ----
  await E(p, 'openStaffForm(null)');
  await p.fill('#s_name', 'Ramesh Kumar'); await p.fill('#s_phone', '98765 11122'); await p.fill('#s_dob', '1998-03-15'); await p.dispatchEvent('#s_dob', 'change');
  assert(+(await p.inputValue('#s_age')) >= 27, 'age filled from the date of birth');
  await p.fill('#s_addr', 'H.No 12, Ward 4, Rampur, 244901');
  await p.selectOption('#s_idtype', 'Aadhaar'); await p.fill('#s_idno', '1234 5678 901');
  await p.setInputFiles('[data-sidf="idPhoto"]', { name:'aadhaar.png', mimeType:'image/png', buffer: png() }); await p.waitForTimeout(300);
  await p.fill('#s_salary', '12000'); await p.fill('#s_pleave', '3'); await p.fill('#s_bonus', '5000'); await p.fill('#s_bonusnote', 'Diwali');
  await p.fill('#s_dfrom', '09:00'); await p.fill('#s_dto', '18:00'); await p.selectOption('#s_woff', 'Tuesday');
  await p.fill('#s_scope', 'Tandoor: roti, naan\nClean tandoor area at closing'); await p.fill('#s_lockin', '6'); await p.fill('#s_notice', '30');
  await p.fill('#s_join', '2026-07-15'); await p.fill('#s_jtime', '09:30');
  await p.click('#s_save'); await p.waitForTimeout(100);
  assert(/Aadhaar number has 12 digits/.test(await p.textContent('#s_err')), 'Aadhaar must have 12 digits');
  await p.fill('#s_idno', '1234 5678 9012'); await p.click('#s_save'); await p.waitForTimeout(200);
  const st = await E(p, `JSON.stringify((function(s){ return [s.address, s.idType, s.idNo, !!s.idPhoto, s.dob, s.joinDate, s.joinTime, s.salary, s.paidLeave, s.bonus, s.bonusNote, s.dutyFrom, s.dutyTo, s.weeklyOff, s.lockIn, s.noticeDays, /Tandoor/.test(s.scope)]; })(staff[0]))`);
  assert(st==='["H.No 12, Ward 4, Rampur, 244901","Aadhaar","1234 5678 9012",true,"1998-03-15","2026-07-15","09:30",12000,3,5000,"Diwali","09:00","18:00","Tuesday",6,30,true]', 'all details saved: '+st);
  assert(await E(p, 'paidLeavePerMonth(staff[0])')===3 && await E(p, 'paidLeavePerMonth()')===2, 'paid leave per staff (3) instead of the shop rule (2)');
  await E(p, 'openStaffProfile(staff[0].id)');
  const prof = (await p.textContent('.sdet')).replace(/\s+/g,' ');
  assert(/AddressH\.No 12/.test(prof) && /09:00–18:00 \(9 h\) · off on Tuesday/.test(prof) && /6 months · till 15 Jan 2027/.test(prof) && /30 days/.test(prof) && /₹5,000 · Diwali/.test(prof) && /3 days a month/.test(prof) && /Joined15 Jul 2026 · 09:30/.test(prof) && /not registered/.test(prof), 'profile shows the details, lock-in end, notice, bonus, leave: '+prof.slice(0,300));
  await p.screenshot({ path: process.env.S+'/staff_details.png' });
  assert(await E(p, `maskId({ idNo:"1234 5678 9012" })`)==='1234 5678 9012', 'owner sees the full ID number');
  // ---- Real face library loads (blank photo = no face) ----
  const real = await E(p, `(function(){ var c = document.createElement("canvas"); c.width = 320; c.height = 320; c.getContext("2d").fillStyle="#888"; c.getContext("2d").fillRect(0,0,320,320); return faceDescriptor(c).then(function(r){ return r===null ? "noface" : "face"; }, function(e){ return "error "+e; }); })()`);
  assert(real==='noface', 'face-api and its models load on the phone; a blank photo has no face: '+real);
  // ---- Stub the face numbers ----
  await E(p, `window.__faceVec = function(seed){ var a = []; for(var i=0;i<128;i++) a.push(Math.round(Math.sin(i*seed)*0.1*10000)/10000); return a; };
    window.__nextFace = window.__faceVec(1); faceDescriptor = function(){ return Promise.resolve(window.__nextFace ? { desc:window.__nextFace.slice(), score:0.9 } : null); };`);
  // Register face: 3 photos
  await p.click('#sp_face');
  for (let i = 0; i < 3; i++){ await p.waitForFunction(() => { const v = document.getElementById('cam_v'); return v && v.videoWidth > 0; }, null, { timeout:10000 }); await p.click('#cam_shot'); await p.waitForTimeout(200); }
  await dis(); await p.waitForTimeout(100);
  assert(await E(p, `staff[0].faceDesc && staff[0].faceDesc.length===128 && !!staff[0].facePhoto && !!staff[0].faceAt`), 'face registered from 3 photos');
  // Cafe location from this phone
  await E(p, 'closeForm(); openCafeLocation()'); await p.click('#cl_here'); await p.waitForTimeout(500); await dis();
  assert(await E(p, `settings.outletLoc && Math.abs(settings.outletLoc.lat-28.6139)<0.0001 && settings.outletLoc.radius===100`), 'cafe location saved (100 m)');
  await E(p, 'closeForm()');
  // second staff with a different face
  await E(p, `staff.push({ id:'s2', name:'Sonu', role:'Waiter', roles:['Waiter'], status:'Active', joinDate:'2026-07-15', salary:9000, faceDesc:window.__faceVec(7), faceAt:Date.now() }); saveStaff(); renderAll();`);
  await E(p, 'scheduleFlush(0)'); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 });
  // Check in: same face, at the cafe
  await E(p, `window.__nextFace = window.__faceVec(1).map(function(v,i){ return v + (i%2?0.01:-0.01); }); showView('staff'); switchStaffSub && switchStaffSub('attendance');`).catch(()=>{});
  await E(p, 'openFaceCheckin()'); await p.click(`[data-ckin="${await E(p,'staff[0].id')}"]`);
  await p.waitForFunction(() => { const v = document.getElementById('cam_v'); return v && v.videoWidth > 0; }, null, { timeout:10000 }); await p.click('#cam_shot');
  await p.waitForSelector('.ckdone', { timeout:15000 });
  let done = (await p.textContent('.ckdone')).replace(/\s+/g,' ');
  assert(/Checked in/.test(done) && /Face matches/.test(done) && /At the cafe \(\d+ m\)/.test(done) && /Marked Present/.test(done), 'check-in: face matches, at the cafe, marked Present: '+done);
  await p.screenshot({ path: process.env.S+'/face_checkin.png' });
  await p.click('#ckd_ok'); await E(p, 'pollRemote()'); await p.waitForTimeout(1500);
  const att = await E(p, `JSON.stringify(attendance.filter(function(a){ return a.staffId===staff[0].id; }).map(function(a){ return [a.status, a.via]; }).concat(checkins.map(function(c){ return [c.kind, c.faceOk, c.locOk, !!c.photo]; })))`);
  assert(att==='[["Present","face"],["in",true,true,true]]', 'server saved the check-in with the selfie and marked Present: '+att);
  // Again within a minute: refused
  const again = await E(p, `api("POST", "/api/checkin"+API_Q, { staffId: staff[0].id, desc: window.__nextFace, lat:28.6139, lng:77.209, acc:10 }).then(function(r){ return r.status+" "+(r.data&&r.data.error); })`);
  assert(/^409 Already checked in/.test(again), 'a second tap within a minute is refused: '+again);
  // Sonu: wrong face → saved but not Present
  await E(p, 'openFaceCheckin()'); await p.click('[data-ckin="s2"]');
  await p.waitForFunction(() => { const v = document.getElementById('cam_v'); return v && v.videoWidth > 0; }, null, { timeout:10000 }); await p.click('#cam_shot');
  await p.waitForSelector('.ckdone', { timeout:15000 });
  done = (await p.textContent('.ckdone')).replace(/\s+/g,' ');
  assert(/Face does not match/.test(done) && /not marked automatically/.test(done), 'someone else\'s face: flagged, not marked Present');
  await p.click('#ckd_ok');
  // Far away (3 km) with the right face
  await ctx.setGeolocation({ latitude:28.64090, longitude:77.20900, accuracy:20 });
  await E(p, `staff.push({ id:'s3', name:'Raju', role:'Helper', roles:['Helper'], status:'Active', joinDate:'2026-07-15', salary:8000, faceDesc:window.__faceVec(7), faceAt:Date.now() }); saveStaff();`);
  await E(p, 'scheduleFlush(0)'); await p.waitForFunction(() => window.__ev('Object.keys(cloud.dirty).length===0'), null, { timeout:20000 });
  const far = await E(p, `api("POST", "/api/checkin"+API_Q, { staffId:'s3', desc: window.__faceVec(7), lat:28.6409, lng:77.209, acc:20 }).then(function(r){ return r.status===409 ? "wait" : JSON.stringify([r.data.checkin.faceOk, r.data.checkin.locOk, r.data.checkin.dist > 2900]); })`);
  assert(far==='[true,false,true]', 'far from the cafe: place check fails: '+far);
  // Attendance list shows the badges
  await E(p, 'pollRemote()'); await p.waitForTimeout(1500); await E(p, `staffDate = fmtDate(new Date()); attMode = "day"; renderAll();`);
  await E(p, `showView('staff'); (window.switchStaffSub||function(){})('attendance')`).catch(()=>{});
  await E(p, `(function(){ var b = document.querySelector('#staffCtl button[data-s="attendance"]'); if(b) b.click(); })()`);
  await p.waitForTimeout(200);
  const av = (await p.textContent('#attendView')).replace(/\s+/g,' ');
  assert(/🟢 In \d\d:\d\d 🙂✓ 📍✓/.test(av) && /🙂✗/.test(av) && /by face/.test(av), 'attendance shows check-in badges (✓ / ✗) and "by face"');
  await p.screenshot({ path: process.env.S+'/face_attendance.png' });
  await p.click('.ckb.bad'); await p.waitForTimeout(150);
  assert(/Does not match/.test(await p.textContent('#sheet')), 'tap a badge: selfie, registered photo, face and place result');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
