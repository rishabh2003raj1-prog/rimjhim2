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
  await E(p, `menuItems=[{id:'c1',name:'Masala Chai',localName:'मसाला चाय',category:'Tea & Coffee',price:20,veg:'veg',active:true},
    {id:'c2',name:'Veg Hakka Noodles (Full)',category:'Chinese',price:129,veg:'veg',active:true},
    {id:'c3',name:'Chicken Biryani (Full)',category:'Biryani',price:199,veg:'nonveg',active:true},
    {id:'c4',name:'Old Dish',category:'Chinese',price:50,active:false}];
    sales=[]; dishLog=[]; saveMenu(); saveSales(); saveDishLog(); settings.upiId='rimjhim@okaxis'; saveSettings(); renderAll(); showView('counter');`);
  assert(await p.isVisible('nav.tabs button[data-v="counter"]'), 'Counter tab in the bottom bar');
  const tiles = await p.$$eval('#counterView .ctile', a => a.map(x => x.textContent));
  assert(tiles.length===3 && !tiles.some(t=>/Old Dish/.test(t)), 'picture tiles for dishes on the menu only');
  assert(tiles.some(t => /मसाला चाय/.test(t)) && tiles.some(t=>/☕/.test(t)), 'Hindi name and picture shown');
  await p.click('.ctile[data-add="c1"]'); await p.click('.ctile[data-add="c1"]'); await p.click('.ctile[data-add="c1"]');
  await p.click('.ctile[data-add="c2"]');
  await p.click('.ctile[data-add="c1"] .cminus');
  assert(/₹169/.test(await p.textContent('.cbar')) && /3 items/.test(await p.textContent('.cbar')), 'bar shows total ₹169 for 3 items');
  await p.click('#ct_go');
  assert(/₹169/.test(await p.textContent('.ptotal')), 'bill sheet total');
  await p.click('[data-more="c2"]'); assert(/₹298/.test(await p.textContent('.ptotal')), '+ on bill sheet updates total');
  await p.click('[data-less="c2"]');
  await p.click('[data-pay="cash"]'); await p.click('[data-note="100"]'); await p.click('[data-note="100"]');
  const ch = (await p.textContent('.pchange')).replace(/\s+/g,' ');
  assert(/Give back\s*₹31/.test(ch), 'change to give back ₹31: '+ch);
  await p.click('#pp_done'); await p.waitForTimeout(200);
  assert(/Bill 1 saved/.test(await p.textContent('#sheet')), 'bill saved screen');
  await p.click('#pd_ok');
  let r = await E(p, `({ s: sales.map(function(x){ return [x.mode, x.amount, x.order && x.order.no, x.order && x.order.given]; }), d: dishLog.map(function(d){ return [d.menuId,d.qty,!!d.orderId]; }), left: Object.keys(counterOrder).filter(function(k){return counterOrder[k];}).length })`);
  console.log('   '+JSON.stringify(r));
  assert(r.s.length===1 && r.s[0][0]==='Cash' && r.s[0][1]===169 && r.s[0][3]===200, 'one cash sale ₹169 with items');
  assert(r.d.length===2 && r.d.every(x=>x[2]) && r.left===0, 'plates added to dish counts; order cleared');
  // UPI with QR
  await p.click('.ctile[data-add="c3"]'); await p.click('#ct_go'); await p.click('[data-pay="upi"]'); await p.waitForSelector('#pp_qr svg', { timeout:5000 }).catch(()=>{});
  assert(await p.$('#pp_qr svg'), 'UPI QR code shown');
  await p.click('#pp_done'); await p.click('#pd_ok');
  // Udhaar
  await p.click('.ctile[data-add="c1"]'); await p.click('#ct_go'); await p.click('[data-pay="udhaar"]');
  await p.click('#pp_udh'); assert(/Tap a name/.test(await p.textContent('#pp_err')), 'udhaar needs a name');
  await p.fill('#pp_newcust','Sharma ji'); await p.click('#pp_udh'); await p.click('#pd_ok');
  r = await E(p, `sales.map(function(x){ return [x.mode, x.customer, x.order.no]; })`);
  assert(JSON.stringify(r)===JSON.stringify([["Cash","Counter",1],["UPI","Counter",2],["Credit","Sharma ji",3]]), 'bill numbers and modes: '+JSON.stringify(r));
  assert(/3 bills today/.test(await p.textContent('#counterView')), 'header counts bills today');
  // Sales list collapses counter bills
  await E(p, `sales.push({id:'m1',date:fmtDate(new Date()),customer:'Party order',desc:'',amount:1000,gst:0,mode:'UPI'}); saveSales(); recPeriod='day'; renderAll(); showView('records'); switchRecordsSub('sales');`);
  const sl = (await p.textContent('#salesList')).replace(/\s+/g,' ');
  assert(/Counter bills · 3/.test(sl) && /Party order/.test(sl) && !/Bill 1:/.test(sl), 'sales list: one row for counter bills plus other sales');
  await p.click('#salesList [data-cbills]');
  const bl = (await p.textContent('#sheet')).replace(/\s+/g,' ');
  assert(/#3/.test(bl) && /Sharma ji/.test(bl) && /2× Masala Chai/.test(bl), "today's bills sheet lists bills");
  await p.click('[data-void]'); await p.click('#dlgBtns .dlgyes');  await p.waitForTimeout(200);
  r = await E(p, `({ n: sales.filter(function(s){return s.order;}).length, d: dishLog.filter(function(d){return d.orderId;}).length })`);
  assert(r.n===2 && r.d===3, 'cancel bill removes sale and its plates: '+JSON.stringify(r));
  await E(p, 'closeForm()');
  // tally does not duplicate billed plates
  await E(p, `openTally(fmtDate(new Date()))`);
  assert(/plates already billed/.test(await p.textContent('#sheet')), 'tally explains billed plates');
  await p.click('.tallybtn[data-tap="c1"]'); await p.click('#ty_save');
  r = await E(p, `({ ord: dishLog.filter(function(d){return d.orderId;}).length, tal: dishLog.filter(function(d){return !d.orderId;}).map(function(d){return [d.menuId,d.qty];}) })`);
  assert(r.ord===3 && JSON.stringify(r.tal)==='[["c1",1]]', 'tally keeps bill plates and adds extra: '+JSON.stringify(r));
  // Simple mode
  await E(p, `showView('counter')`); await p.click('#ct_simple');
  assert(await E(p, `document.body.classList.contains('simple')`), 'big & simple mode on');
  const cols = await p.$eval('.cgrid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  assert(cols===2, 'simple mode: two big tiles per row');
  const t1 = (await p.textContent('.ctile[data-add="c1"]'));
  assert(/मसाला चाय/.test(t1) && !/Masala Chai/.test(t1), 'simple mode: only Hindi name when there is one');
  assert(!(await p.$('#ct_upi')) && !(await p.$('.ccats [data-cat="__all"]')), 'simple mode: fewer buttons');
  await p.screenshot({ path: process.env.S+'/counter_simple.png' });
  await p.click('#ct_simple'); await p.click('.ctile[data-add="c2"]'); await p.click('.ctile[data-add="c1"]');
  await p.screenshot({ path: process.env.S+'/counter.png' });
  await p.click('#ct_go'); await p.screenshot({ path: process.env.S+'/counter_bill.png' });
  await p.click('[data-pay="cash"]'); await p.click('[data-note="500"]'); await p.screenshot({ path: process.env.S+'/counter_cash.png' });
  console.log('ERRORS', JSON.stringify(errs)); await b.close();
})();
