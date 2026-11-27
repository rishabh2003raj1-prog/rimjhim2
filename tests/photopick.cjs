// Every "add photo" offers 📷 camera or 🖼️ gallery: menu dish, ingredient, bill, asset (parking and staff ID are in their own suites).
const { chromium } = require(process.env.PW_MODULE || 'playwright');
const fs = require('fs');
const HTML = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'),'utf8').replace('\n})();\n</script>', '\nwindow.__ev=function(c){return eval(c);};\n})();\n</script>');
const E = (p, c) => p.evaluate(x => window.__ev(x), c);
const assert = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exitCode = 1; } else console.log('ok: ' + m); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await (await b.newContext({ viewport:{width:400,height:850} })).newPage();
  p.on('pageerror', e => errs.push(e.message)); await p.route(u => u.pathname === '/', r => r.fulfill({ status:200, contentType:'text/html', body: HTML }));
  await p.goto('http://127.0.0.1:8787/'); await p.waitForSelector('#loginBg.on'); await p.fill('#loginPin','1234'); await p.click('#loginGo'); await p.waitForTimeout(1500);
  async function check(name, open, after){
    await E(p, open); await p.waitForTimeout(150);
    await p.click(after);
    const msg = await p.textContent('#dlgMsg').catch(()=>''), btns = await p.textContent('#dlgBtns').catch(()=>'');
    assert(/Add a photo/.test(msg) && /camera/.test(btns) && /gallery/.test(btns), name+': asks camera or gallery');
    const [cam] = await Promise.all([p.waitForEvent('filechooser', { timeout:5000 }), p.click('#dlgBtns button:nth-child(1)')]);
    const capt = await cam.element().evaluate(e => e.getAttribute('capture'));
    await cam.setFiles({ name:'x.png', mimeType:'image/png', buffer:PNG }); await p.waitForTimeout(300);
    assert(capt==='environment', name+': 📷 opens the camera');
  }
  await E(p, `menuItems=[{id:'m1',name:'Chai',category:'Tea',price:20,active:true}]; ingredients=[{id:'i1',name:'Milk',unit:'ml',type:'Raw material'}]; saveMenu(); saveIngredients(); renderAll();`);
  await check('dish photo', `openMenuForm('m1')`, '#m_imgadd');
  assert(/^data:image/.test(await E(p, 'document.querySelector("#sheet img") ? document.querySelector("#sheet img").src : ""')), 'dish photo set from the camera');
  await E(p, 'closeForm()');
  await check('ingredient photo', `openIngredientForm('i1')`, '#i_photo');
  await E(p, 'closeForm()');
  await check('purchase bill photo', `openBillForm(null)`, '#b_imgadd');
  await E(p, 'closeForm()');
  await check('asset photo', `openAssetForm(null)`, '#a_imgadd');
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
