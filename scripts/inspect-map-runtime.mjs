import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1400,height:1000}});
await page.goto('http://127.0.0.1:4173/', {waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:/Load sample/i}).click();
await page.getByText(/Import review/i).waitFor();
await page.getByRole('button',{name:/Import into workspace/i}).click();
await page.getByRole('button',{name:/sample-parcels.*source/i}).waitFor({timeout:15000});
await page.waitForTimeout(2500);
const data = await page.evaluate(() => {
  const mapEl = document.querySelector('.map-container');
  const canvases = [...document.querySelectorAll('canvas')].map((c,i)=>({i,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight,cls:c.className}));
  const imgs = [...document.querySelectorAll('img')].slice(0,20).map((img)=>({src:img.src, w:img.clientWidth, h:img.clientHeight, complete:img.complete}));
  const maplibre = document.querySelector('.maplibregl-map');
  const ctrl = document.querySelectorAll('.maplibregl-ctrl').length;
  return {
    mapContainer: mapEl ? {clientWidth:mapEl.clientWidth, clientHeight:mapEl.clientHeight, html:mapEl.innerHTML.slice(0,1500)} : null,
    canvases, imgs, hasMaplibre: !!maplibre, ctrl,
  };
});
console.log(JSON.stringify(data,null,2));
await browser.close();
