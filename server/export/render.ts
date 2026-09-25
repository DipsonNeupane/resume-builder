import React from 'react'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { ResumePreview } from '../../src/components/resumeMarkup.js'
import { type Resume } from '../../src/model.js'
import {validateExport} from './validate.ts'
import {HttpError} from '../http/security.js'

const require=createRequire(import.meta.url)
let cssPromise:Promise<string>|undefined
async function fontCss(name:string){
 const root=path.dirname(require.resolve(`@fontsource/${name}/400.css`))
 const css=await readFile(path.join(root,'400.css'),'utf8')
 const files=[...css.matchAll(/url\(\.\/([^)]*)\)/g)]
 let output=css
 for(const match of files){
  // Only fixed installed package font assets; never user-controlled paths/URLs.
  const bytes=await readFile(path.join(root,match[1]))
  const mime=match[1].endsWith('.woff2')?'font/woff2':'font/woff'
  output=output.replace(match[0],`url(data:${mime};base64,${bytes.toString('base64')})`)
 }
 return output
}
async function styles(){
 if(!cssPromise)cssPromise=(async()=>{
  const app=await readFile(path.join(process.cwd(),'src/styles.css'),'utf8')
  const fonts=await Promise.all(['noto-sans','noto-sans-sc'].map(fontCss))
  for(const [name,file] of [['Noto Sans Arabic','NotoSansArabic.ttf'],['Noto Sans Devanagari','NotoSansDevanagari.ttf']]){
   const bytes=await readFile(path.join(process.cwd(),'server/export/fonts',file))
   fonts.push(`@font-face{font-family:'${name}';font-weight:100 900;src:url(data:font/ttf;base64,${bytes.toString('base64')}) format('truetype');}`)
  }
  return fonts.join('\n')+app.replace(/@import[^;]+;/g,'')+"\n.resume-paper{font-family:'Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',sans-serif}.resume-paper.classic{font-family:Georgia,'Noto Sans','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans SC',serif}"
 })().catch(error=>{cssPromise=undefined;throw error})
 return cssPromise
}
export async function resumeHtml(resume:Resume):Promise<string>{
 validateExport(resume)
 const markup=renderToStaticMarkup(React.createElement('div',{className:'print-only'},React.createElement(ResumePreview,{resume})))
 return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:"><style>${await styles()}\n@page{size:${resume.paper};margin:16mm}</style></head><body>${markup}</body></html>`
}
export async function renderPdf(resume:Resume, executablePath?:string):Promise<Uint8Array>{
 const html=await resumeHtml(resume)
 const browser=await puppeteer.launch({executablePath:executablePath??await chromium.executablePath(),args:executablePath?[]:chromium.args,headless:true,timeout:20000})
 try{
  const page=await browser.newPage()
  await page.setJavaScriptEnabled(false)
  await page.setRequestInterception(true)
  page.on('request',request=>{void (request.url().startsWith('data:')?request.continue():request.abort())})
  await page.setContent(html,{waitUntil:'load',timeout:20000})
  const bytes=await page.pdf({format:resume.paper,preferCSSPageSize:true,printBackground:true,timeout:20000})
  if(bytes.length>4_000_000)throw new HttpError(413,'This PDF is too large. Shorten the resume and retry.')
  return bytes
 }finally{await browser.close()}
}
