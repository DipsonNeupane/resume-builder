import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const origin='https://job-boards.greenhouse.io';
for(const scenario of ['valid','long','wrong-id','closed','oversize','lookalike']) test(`Greenhouse capture: ${scenario}`,async({page})=>{
 const url=scenario==='lookalike'?'https://job-boards.greenhouse.io.evil.test/acme/jobs/123':`${origin}/acme/jobs/123`;
 await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<p>Job page</p>'}));
 let requests=0;
 await page.route('https://boards-api.greenhouse.io/**',async route=>{
  requests++;
  expect(route.request().headers()['cookie']).toBeUndefined();
  expect(route.request().headers()['referer']).toBeUndefined();
  const job=route.request().url().includes('/jobs/');
  await route.fulfill({status:scenario==='closed'?404:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body: scenario==='oversize'?'x'.repeat(524289):JSON.stringify(job?{id:scenario==='wrong-id'?124:123,title:'Support specialist',content:scenario==='long'?'x'.repeat(13000):'&lt;p&gt;Help customers &amp; document solutions.&lt;/p&gt;&lt;script&gt;window.hacked=true&lt;/script&gt;&lt;img src="https://evil.test/tracker"&gt;'}:{name:'Acme'})});
 });
 let unsafeRequests=0;await page.route('https://evil.test/**',route=>{unsafeRequests++;return route.abort();});
 await page.goto(url);
 const result=await page.evaluate(await readFile('apps/extension/dist/inject/extract-job.js','utf8'));
 expect(result.supported).toBe((scenario==='valid'||scenario==='long'));
 if(scenario==='long') expect(result.capture.description.length).toBe(12000);
 if(scenario==='valid') {expect(result.capture.company).toBe('Acme');expect(result.capture.description).toBe('Help customers & document solutions.');expect(await page.evaluate(()=>Reflect.get(window,'hacked'))).toBeUndefined();}
 expect(unsafeRequests).toBe(0);
 expect(requests).toBe(scenario==='lookalike'?0:2);
});
