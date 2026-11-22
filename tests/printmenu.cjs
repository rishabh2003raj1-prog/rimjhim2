const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
if(!require('fs').existsSync((process.env.S||'.') + '/RimJhim_Revised_Menu_Import.txt')){ console.log('skip: needs the cafe menu file in $S (kept out of the repo)'); process.exit(0); }
async function open(b, errs){ const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500); return p; }
(async () => {
  const b = await chromium.launch(); const errs = []; const p = await open(b, errs);
  const dis = () => p.click('#dlgBtns button', { timeout:2000 }).catch(()=>{});
  const text = fs.readFileSync(process.env.S + '/RimJhim_Revised_Menu_Import.txt', 'utf8');
  await E(p, `menuItems=[]; saveMenu(); renderAll(); showView('records'); switchRecordsSub('menu');`);
  await p.click('#menu_import'); await p.fill('#mi_text', text); await p.click('#mi_check'); await p.click('#mi_go'); await p.waitForTimeout(300); await dis();
  await E(p, `menuItems.forEach(function(m){ if(/Masala Chai/.test(m.name)) m.localName='मसाला चाय'; if(/Veg Hakka Noodles/.test(m.name)) m.localName='वेज हक्का नूडल्स'; }); settings.upiId='rimjhim@okaxis'; saveMenu(); renderAll(); switchRecordsSub('menu');`);
  assert(await p.isVisible('#menu_print'), 'Printable menu button on the Menu screen');
  await E(p, `saveMenuPdfOpts({ layout:'list', theme:'classic' })`); await p.click('#menu_print');
  await p.fill('#mp_tag','Sector 27, Noida · near Atta Market & Vinayak Hospital · 7 AM – 11 PM');
  await p.fill('#mp_phone','98xxxxxx10'); await p.check('#mp_qr');
  const secs = await E(p, `menuPdfSections(menuPdfOpts()).map(function(s){ return s.cat+':'+s.rows.length+(s.sizes?'*':''); }).join(' | ')`);
  console.log('   '+secs);
  const hk = await E(p, `(function(){ var s = menuPdfSections(menuPdfOpts()).find(function(x){ return /Chinese/.test(x.cat); }); var r = s.rows.find(function(x){ return /Hakka/.test(x.name); }); return r.name+' = '+rowPrice(r)+' / '+r.local; })()`);
  assert(/^Hakka Noodles = ₹79 \/ 129/.test(hk), 'Half / Full merged on one line: '+hk);
  await p.click('#mp_show'); await p.waitForSelector('#mp_prev img', { timeout:20000 });
  const np = await p.$$eval('#mp_prev img', a => a.length);
  assert(np>=2 && np<=6, 'A4 preview pages: '+np);
  // save page images to look at
  const imgs = await p.$$eval('#mp_prev img', a => a.map(x => x.src));
  imgs.slice(0,2).forEach((src,i) => fs.writeFileSync(process.env.S+'/menu_a4_p'+(i+1)+'.jpg', Buffer.from(src.split(',')[1], 'base64')));
  await E(p, `window.__pdf=null; sharePdf=function(doc, f){ window.__pdf={ pages: doc.internal.getNumberOfPages(), name:f, size: doc.output('blob').size }; }`);
  await p.click('#mp_make'); await p.waitForFunction(() => window.__ev('window.__pdf'), null, { timeout:30000 });
  const pdf = await E(p, 'window.__pdf');
  assert(pdf.pages===np && /_Menu_A4\.pdf$/.test(pdf.name) && pdf.size < 6e6, 'PDF made: '+JSON.stringify(pdf));
  // A5 dark, skip a section
  await p.click('[data-mps="A5"]'); await p.click('[data-mpt="dark"]');
  await p.uncheck('[data-mpc="Shakes"]').catch(()=>{});
  await p.click('#mp_show'); await p.waitForSelector('#mp_prev img', { timeout:20000 });
  const a5 = await p.$$eval('#mp_prev img', a => a.map(x => x.src));
  fs.writeFileSync(process.env.S+'/menu_a5_p1.jpg', Buffer.from(a5[0].split(',')[1], 'base64'));
  assert(a5.length > np, 'A5 has more pages: '+a5.length);
  const opts = await E(p, 'menuPdfOpts()');
  assert(opts.size==='A5' && opts.theme==='dark' && /Atta Market/.test(opts.tagline), 'choices remembered on this phone');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
