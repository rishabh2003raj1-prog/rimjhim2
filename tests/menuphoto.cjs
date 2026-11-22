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
  // a sample "photo" (a drawn image) on three dishes, to check photos are placed and cropped
  await E(p, `(function(){ var c = document.createElement('canvas'); c.width = 400; c.height = 300; var g = c.getContext('2d'); var gr = g.createRadialGradient(200,150,20,200,150,190); gr.addColorStop(0,'#F7D27A'); gr.addColorStop(1,'#8A3B12'); g.fillStyle = gr; g.fillRect(0,0,400,300); g.fillStyle='#fff'; g.font='bold 40px sans-serif'; g.fillText('PHOTO', 120, 165);
    var url = c.toDataURL('image/jpeg', 0.8); menuItems.forEach(function(m){ if(/^(Aloo Paratha \\+ Tea|Poha \\+ Tea|Masala Tea)$/.test(m.name)) m.photo = url; if(/Masala Tea/.test(m.name)) m.localName='मसाला चाय'; }); saveMenu(); localStorage.removeItem('menu_pdf_v1'); renderAll(); switchRecordsSub('menu'); })()`);
  await p.click('#menu_print');
  const o = await E(p, 'menuPdfOpts()');
  assert(o.layout==='photos' && o.theme==='royal' && o.legal===true && /illustrative purposes only/.test(o.legalText), 'defaults: food pictures, royal theme, legal note on');
  console.log('   NOTE '+JSON.stringify((await p.textContent('#sheet')).match(/\d+ of \d+ dishes[^.]*/)[0])); assert(/\d+ of \d+ dishes have a photo/.test(await p.textContent('#sheet')), 'tells how many dishes have photos');
  assert(/illustrative purposes only/.test(await p.inputValue('#mp_legaltext')), 'legal note editable');
  await p.fill('#mp_tag','Sector 27, Noida · near Atta Market & Vinayak Hospital · 7 AM – 11 PM');
  await p.click('#mp_show'); await p.waitForSelector('#mp_prev img', { timeout:30000 });
  let imgs = await p.$$eval('#mp_prev img', a => a.map(x => x.src));
  console.log('   royal photo pages: '+imgs.length);
  fs.writeFileSync(process.env.S+'/mp_royal_p1.jpg', Buffer.from(imgs[0].split(',')[1], 'base64'));
  fs.writeFileSync(process.env.S+'/mp_royal_last.jpg', Buffer.from(imgs[imgs.length-1].split(',')[1], 'base64'));
  assert(imgs.length>=5 && imgs.length<=13, 'photo layout pages: '+imgs.length);
  await p.click('[data-mpt="terracotta"]'); await p.click('#mp_show'); await p.waitForSelector('#mp_prev img', { timeout:30000 });
  imgs = await p.$$eval('#mp_prev img', a => a.map(x => x.src)); fs.writeFileSync(process.env.S+'/mp_terra_p1.jpg', Buffer.from(imgs[0].split(',')[1], 'base64'));
  await p.click('[data-mpt="emerald"]'); await p.click('[data-mpl="list"]'); await p.click('#mp_show'); await p.waitForSelector('#mp_prev img', { timeout:30000 });
  imgs = await p.$$eval('#mp_prev img', a => a.map(x => x.src)); fs.writeFileSync(process.env.S+'/mp_emerald_list.jpg', Buffer.from(imgs[imgs.length-1].split(',')[1], 'base64'));
  await p.uncheck('#mp_legal'); await p.waitForTimeout(100); assert(!(await p.$('#mp_legaltext')), 'legal note can be switched off');
  await p.check('#mp_legal'); await p.fill('#mp_legaltext','Prices exclude GST.'); await p.click('#mp_legalreset'); await p.waitForTimeout(100);
  assert(/illustrative purposes only/.test(await p.inputValue('#mp_legaltext')), 'reset to the standard note');
  await E(p, `window.__pdf=null; sharePdf=function(doc, f){ window.__pdf={ pages: doc.internal.getNumberOfPages(), size: doc.output('blob').size }; }`);
  await p.click('[data-mpl="photos"]'); await p.click('[data-mpt="royal"]'); await p.click('#mp_make'); await p.waitForFunction(() => window.__ev('window.__pdf'), null, { timeout:60000 });
  const pdf = await E(p, 'window.__pdf'); console.log('   pdf '+JSON.stringify(pdf));
  assert(pdf.pages>=5 && pdf.size < 15e6, 'photo PDF made');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
