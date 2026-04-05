import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1400,height:1000}});
await page.goto('http://127.0.0.1:4174/', {waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:/Load sample/i}).click();
await page.getByText(/Import review/i).waitFor();
await page.getByRole('button',{name:/Import into workspace/i}).click();
await page.getByRole('button',{name:/sample-parcels.*source/i}).waitFor({timeout:15000});
await page.waitForTimeout(2000);
const data = await page.evaluate(() => {
  const sel = (s) => document.querySelector(s);
  const rect = (el) => el ? ({x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,clientWidth:el.clientWidth,clientHeight:el.clientHeight,cls:el.className}) : null;
  return {
    appShell: rect(sel('.app-shell')),
    mainPane: rect(sel('.main-pane')),
    mapContainer: rect(sel('.map-container')),
    bottomDock: rect(sel('.bottom-dock')),
    topbar: rect(sel('.topbar')),
    leftRail: rect(sel('.left-rail')),
    rightPanel: rect(sel('.right-panel')),
  };
});
console.log(JSON.stringify(data,null,2));
await browser.close();
