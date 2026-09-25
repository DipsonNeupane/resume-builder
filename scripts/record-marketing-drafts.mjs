import {chromium} from '@playwright/test';
import {mkdir,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('marketing/video-drafts');await mkdir(output,{recursive:true});
const base={version:1,name:'Alex Morgan',headline:'Customer Service Assistant',email:'alex@example.com',phone:'',location:'',website:'',summary:'Help customers find products and answer questions.',skills:'Customer service, Teamwork, Clear communication',profileHeading:'Profile',skillsHeading:'Skills & languages',sections:[{id:'experience',title:'Experience',kind:'experience',entries:[{id:'role',title:'Customer Service Assistant',organization:'Example Store',location:'',dates:'2024 – Present',description:'Help customers find products and answer questions.'}]},{id:'education',title:'Education',entries:[]}],template:'modern',paper:'A4',accent:'#20594a',direction:'ltr',language:'en',noExperience:false};
const browser=await chromium.launch();const results=[];
async function record(slug,draft,run){
 if(process.env.VIDEO_ONLY && process.env.VIDEO_ONLY!==slug)return;
 const context=await browser.newContext({viewport:{width:540,height:960},recordVideo:{dir:output,size:{width:540,height:960}}});

 const page=await context.newPage();let cloudRequests=0;const errors=[];
 page.on('request',r=>{if(r.url().includes('supabase.co'))cloudRequests++;});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://resumestride.com',{waitUntil:'networkidle'});
 await page.evaluate(d=>localStorage.setItem('resumestride.resume.v1',JSON.stringify(d)),draft);
 await page.reload({waitUntil:'networkidle'});
 console.log(slug,(await page.locator('body').innerText()).slice(0,220));
 await page.getByRole('button',{name:'Build my resume',exact:true}).first().click();
 async function caption(title,detail){await page.evaluate(({title,detail})=>{
  let el=document.getElementById('demo-caption');if(!el){el=document.createElement('div');el.id='demo-caption';document.body.appendChild(el);el.style.cssText='position:fixed;z-index:99999;inset:0 0 auto;background:#143e32;color:white;padding:22px 26px;font:700 28px/1.15 Arial;pointer-events:none;box-shadow:0 3px 14px #0002';document.body.style.paddingTop='145px';const foot=document.createElement('div');foot.style.cssText='position:fixed;z-index:99999;inset:auto 0 0;background:#143e32;color:white;padding:16px 24px;font:700 20px/1.4 Arial;pointer-events:none';foot.textContent='Build yours free • resumestride.com';document.body.appendChild(foot);}
  el.replaceChildren();const h=document.createElement('div');h.textContent=title;const p=document.createElement('div');p.style.cssText='font:400 16px/1.4 Arial;margin-top:10px';p.textContent=detail+' • Fictional example';el.append(h,p);
 },{title,detail});}
 const hold=async()=>page.waitForTimeout(5000);
 await run(page,caption,hold);
 await page.screenshot({path:resolve(output,slug+'-preview.png')});await hold();
 const video=page.video();await context.close();await rename(await video.path(),resolve(output,slug+'.webm'));
 results.push({slug,cloudRequests,errors});
}
try{
 await record('01-no-experience',{...base,headline:'First-job applicant',summary:'Organized community events and worked with classmates on group projects.',noExperience:true,sections:[{id:'experience',title:'Experience',kind:'experience',entries:[]},{id:'projects',title:'Projects & volunteering',entries:[{id:'p',title:'Community event volunteer',organization:'Example Community Group',location:'',dates:'2025',description:'Welcomed visitors and helped set up activity tables.'}]}]},async(page,caption,hold)=>{
  await caption('No paid experience yet?','Start with what you have actually done');await hold();
  await page.getByRole('button',{name:'Experience',exact:true}).click();await caption('You can say that.','Choose “I don’t have work experience yet”');await hold();
  await page.getByRole('button',{name:'Projects & volunteering',exact:true}).click();await caption('Projects count. Volunteering counts.','Describe your real contribution');await hold();
  await page.getByRole('button',{name:'Preview resume',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await caption('Your first resume starts here.','Free beta • saved on this device');
 });
 await record('02-free-resume',base,async(page,caption,hold)=>{
  await caption('A clean resume. Free.','Start with your details');await hold();
  await page.getByRole('button',{name:'Experience',exact:true}).click();await caption('Add your real experience.','Flexible sections for your career');await hold();
  await page.getByRole('button',{name:'Design & format',exact:true}).click();await page.getByRole('combobox',{name:'Template',exact:true}).selectOption('classic');await caption('Choose from three templates.','Modern, Classic or Minimal');await hold();
  await page.getByRole('button',{name:'Preview resume',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await caption('Preview. Print. Save as PDF.','Browser Print / Save as PDF • Free beta');
 });
 await record('03-clearer-wording',{...base,sections:[{...base.sections[0],entries:[{...base.sections[0].entries[0],description:'Responsible for helping customers find products and answering questions.'}]},base.sections[1]]},async(page,caption,hold)=>{
  await page.getByRole('button',{name:'Experience',exact:true}).click();await caption('Same experience. Clearer wording.','A simple writing tip, not a made-up achievement');await page.getByRole('textbox',{name:'Details (one point per line)',exact:true}).scrollIntoViewIfNeeded();await hold();
  await page.getByRole('textbox',{name:'Details (one point per line)',exact:true}).fill('Help customers find products and answer questions.');await caption('Lead with what you do.','Manual edit: remove filler, keep the facts');await hold();
  await caption('No invented numbers. No inflated claims.','Keep every statement grounded in your experience');await hold();
  await page.getByRole('button',{name:'Preview resume',exact:true}).click();await page.evaluate(()=>window.scrollTo(0,0));await caption('Present your experience clearly.','Build and print a resume free');
 });
 await writeFile(resolve(output,process.env.VIDEO_ONLY ? process.env.VIDEO_ONLY+'-verification.json':'verification.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
 if(results.some(r=>r.cloudRequests||r.errors.length))process.exitCode=1;
}finally{await browser.close();}
