// Zones: owner adds areas, staff check them / report problems, alerts, assets placed in zones.
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
async function call(p, method, path, body){ return p.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method:m, headers:{'Content-Type':'application/json'}, body: bd ? JSON.stringify(bd) : undefined }); return { status:r.status, json: await r.json().catch(()=>null) }; }, [method, path, body]); }
async function open(b, errs, id, pw){ const p = await (await b.newContext({ viewport:{width:400,height:850}, deviceScaleFactor:2 })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); if(id) await p.fill('#loginId', id); await p.fill('#loginPin', pw); await p.click('#loginGo'); await p.waitForTimeout(2000); return p; }
(async () => {
  const b = await chromium.launch(), errs = [];
  const O = await open(b, errs, '', '1234');
  await E(O, `staff=[{id:'s1',name:'Ravi',role:'Cleaner',status:'Active',defaultShift:'Morning'}]; saveStaff(); checks=[]; saveChecks(); settings.zones=[]; saveSettings();
    assets=[{id:'a1',name:'Geyser',category:'Electrical',cost:5000,purchaseDate:'2026-07-01',depRate:15,maintenance:[]}]; saveAssets(); renderAll(); showView('records'); switchRecordsSub('zones');`);
  assert(/No zones yet/.test(await O.textContent('#zonesView')), 'empty to start, with a way to add');
  await O.click('#zn_suggest'); await O.waitForSelector('[data-zs="kitchen"]');
  for (const k of ['kitchen','washroom','parking','store','hall']) await O.click(`[data-zs="${k}"]`);
  await O.screenshot({ path: process.env.S+'/zones_add.png' });
  await O.click('#zs_s'); await O.waitForTimeout(200);
  const zs = await E(O, `cafeZones().map(function(z){ return z.name+'|'+z.every+'|'+z.points.length; }).join(', ')`);
  console.log('   '+zs);
  assert(/Kitchen\|twice\|4/.test(zs) && /Washroom\|twice\|4/.test(zs) && /Parking\|daily/.test(zs) && /Store Room/.test(zs) && /Hall Seating/.test(zs), 'suggested zones added with check points');
  assert((await O.$$('#zonesView .ztile')).length===5 && /Not checked yet/.test(await O.textContent('#zonesView')), 'zone tiles show');
  // edit washroom: in charge Ravi
  const wid = await E(O, `cafeZones().find(function(z){ return z.key==='washroom'; }).id`);
  await O.click(`[data-zone="${wid}"]`); await O.click('#zs_edit'); await O.selectOption('#zf_in', 's1'); await O.click('#zf_s'); await O.waitForTimeout(150);
  assert(/Ravi in charge/.test(await O.textContent('#sheet')), 'person in charge saved');
  // check with one problem
  await O.click('#zs_check'); await O.click('#zc_all'); await O.click('[data-zp="1"][data-v="0"]'); await O.fill('#zc_note', 'soap finished');
  await O.click('#zc_s'); await O.waitForTimeout(150);
  const st = await E(O, `(function(){ var c = zoneChecks('${wid}')[0], i = zoneIssues('${wid}', true); return { ok:c.ok, bad:c.points.filter(function(p){ return !p.ok; }).length, issues:i.length, text:i[0]&&i[0].text }; })()`);
  assert(st.ok===false && st.bad===1 && st.issues===1 && /Soap & tissue there — soap finished/.test(st.text), 'a ✖ point opens a problem: '+JSON.stringify(st));
  await E(O, `closeForm(); showView('dashboard'); renderAll();`); await O.waitForTimeout(150);
  const at = await O.textContent('#attnBox');
  assert(/1 problem open in zones/.test(at) && /4 zones due for a check/.test(at), 'Dashboard: problem and due zones listed');
  // fix it
  await E(O, `showView('records'); switchRecordsSub('zones');`); await O.click(`[data-zone="${wid}"]`); await O.click('[data-zfix]'); await O.waitForTimeout(150);
  assert(await E(O, `zoneIssues('${wid}', true).length`)===0 && /Fixed lately: Soap/.test(await O.textContent('#sheet')), '✔ Fixed closes the problem');
  await E(O, `closeForm(); renderAll();`);
  assert(!(await O.$(`[data-zone="${wid}"].bad`)) && /✔/.test(await O.textContent(`[data-zone="${wid}"]`)), 'tile is no longer red once fixed');
  // asset into a zone
  await E(O, `closeForm(); openAssetForm('a1')`); await O.selectOption('#a_zone', wid); await O.click('#a_save'); await O.waitForTimeout(150);
  assert(await E(O, `assetById('a1').zoneId`)===wid, 'asset placed in the zone');
  await E(O, `closeForm(); openZoneSheet('${wid}')`);
  assert(/Geyser/.test(await O.textContent('#sheet')), 'zone lists its things');
  await O.screenshot({ path: process.env.S+'/zones_sheet.png' });
  await E(O, `closeForm(); renderAll();`); await O.screenshot({ path: process.env.S+'/zones.png' });
  await O.waitForTimeout(2500);  // let it save to the server
  // billing staff: sees zones, can check, cannot add or fix
  assert((await call(O, 'POST', '/api/users', { login:'bill-1', outlet:'rimjhim', name:'Sita', access:'billing', password:'secret123' })).status===200, 'billing login made');
  const B = await open(b, errs, 'bill-1', 'secret123');
  await E(B, `showView('records'); switchRecordsSub('zones');`); await B.waitForTimeout(200);
  assert((await B.$$('#zonesView .ztile')).length===5 && !(await B.$('#zn_suggest')), 'billing sees zones but cannot add them');
  const kid = await E(B, `cafeZones().find(function(z){ return z.key==='kitchen'; }).id`);
  await B.click(`[data-zone="${kid}"]`); assert(!(await B.$('#zs_edit')), 'billing cannot edit a zone');
  await B.click('#zs_check'); await B.click('#zc_all'); await B.click('#zc_s'); await B.waitForTimeout(2500);
  const srv = await call(O, 'GET', '/api/data?outlet=rimjhim');
  const zc = (srv.json.items.checks_v1.value||[]).filter(c => c.kind==='zone' && c.zoneId===kid);
  assert(zc.length===1 && zc[0].by==='bill-1' && zc[0].byName==='Sita' && zc[0].ok===true, 'billing check saved on the server with who did it');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
