import {mkdir,writeFile} from 'node:fs/promises'
import {chromium} from '@playwright/test'
import {PDFParse} from 'pdf-parse'
import {example} from '../src/model.ts'
import {renderPdf} from '../server/export/render.ts'
const dir='/tmp/resumestride-pdf-qa'
await mkdir(dir,{recursive:true})
for(const template of ['modern','classic','minimal'] as const)for(const paper of ['A4','Letter'] as const){
 const resume={...example(),template,paper}
 resume.summary+=' Languages sample: العربية — हिंदी — 中文.'
 resume.skills+='; FINAL EXPORT MARKER'
 const bytes=await renderPdf(resume,chromium.executablePath())
 const file=`${dir}/${template}-${paper}.pdf`
 await writeFile(file,bytes)
 const size=bytes.length
 const parser=new PDFParse({data:bytes})
 const result=await parser.getText()
 if(!result.text.includes('Alex Morgan')||!result.text.replace(/\s+/g,' ').includes('FINAL EXPORT MARKER'))throw new Error(`Missing content ${file}`)
 console.log(`${template} ${paper}: ${size} bytes, ${result.total} pages, first/last text present`)
 await parser.destroy()
}
