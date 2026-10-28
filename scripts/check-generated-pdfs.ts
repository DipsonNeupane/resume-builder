import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {PDFParse} from 'pdf-parse'
import {example} from '../src/model.ts'
import {renderPdf} from '../server/export/render.ts'
const dir='/tmp/apwico-pdf-qa'
await mkdir(dir,{recursive:true})
const smoke=process.argv.includes('--smoke')
// GitHub's Ubuntu runners block the unprivileged user namespaces Chromium's sandbox needs
// ("No usable sandbox!"). Disable it only for this CI smoke run; local runs keep the sandbox.
const launchArgs=process.env.GITHUB_ACTIONS==='true'&&process.platform==='linux'?['--no-sandbox']:[]
const templates=smoke?(['modern'] as const):(['modern','classic','minimal'] as const)
const papers=smoke?(['A4'] as const):(['A4','Letter'] as const)
for(const template of templates)for(const paper of papers){
 const resume={...example(),template,paper}
 resume.summary+=' Languages sample: العربية — हिंदी — 中文.'
 resume.skills+='; FINAL EXPORT MARKER'
 const bytes=await renderPdf(resume,chromium.executablePath(),launchArgs)
 const file=`${dir}/${template}-${paper}.pdf`
 await writeFile(file,bytes)
 const size=bytes.length
 const parser=new PDFParse({data:bytes})
 const result=await parser.getText()
 if(!result.text.includes('Alex Morgan')||!result.text.replace(/\s+/g,' ').includes('FINAL EXPORT MARKER'))throw new Error(`Missing content ${file}`)
 console.log(`${template} ${paper}: ${size} bytes, ${result.total} pages, first/last text present`)
 await parser.destroy()
}
