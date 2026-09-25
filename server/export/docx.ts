import {type Resume} from '../../src/model.js'
import {createZip} from '../../src/services/zip.js'
import {HttpError} from '../http/security.js'

const NAME_SIZE=32
const HEADING_SIZE=24
const TITLE_SIZE=22
const BODY_SIZE=20
interface RunOptions{bold?:boolean;italic?:boolean;size?:number}

function escapeXml(value:string):string{return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function paragraph(value:string,options:RunOptions={}):string{
 const props:string[]=[]
 if(options.bold)props.push('<w:b/>')
 if(options.italic)props.push('<w:i/>')
 props.push(`<w:sz w:val="${options.size??BODY_SIZE}"/>`)
 const rPr=`<w:rPr>${props.join('')}</w:rPr>`
 return `<w:p><w:pPr>${rPr}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`
}
const linesOf=(value:string):string[]=>value.split('\n').map(line=>line.trim()).filter(Boolean)

export async function renderDocx(resume:Resume):Promise<Uint8Array>{
 const body:string[]=[]
 body.push(paragraph(resume.name||'Untitled',{bold:true,size:NAME_SIZE}))
 if(resume.headline.trim())body.push(paragraph(resume.headline,{italic:true,size:TITLE_SIZE}))
 const contact=[resume.email,resume.phone,resume.location,resume.website].filter(value=>value.trim()).join('  •  ')
 if(contact)body.push(paragraph(contact))
 if(resume.summary.trim()){
  body.push(paragraph(resume.profileHeading||'Profile',{bold:true,size:HEADING_SIZE}))
  for(const line of linesOf(resume.summary))body.push(paragraph(line))
 }
 if(resume.skills.trim()){
  body.push(paragraph(resume.skillsHeading||'Skills & languages',{bold:true,size:HEADING_SIZE}))
  for(const line of linesOf(resume.skills))body.push(paragraph(line))
 }
 for(const section of resume.sections){
  if(!section.entries.some(item=>item.title.trim()||item.organization.trim()||item.description.trim()))continue
  body.push(paragraph(section.title||'Untitled section',{bold:true,size:HEADING_SIZE}))
  for(const item of section.entries){
   if(!item.title.trim()&&!item.organization.trim()&&!item.location.trim()&&!item.dates.trim()&&!item.description.trim())continue
   const title=[item.title,item.organization].filter(value=>value.trim()).join(' — ')
   if(title)body.push(paragraph(title,{bold:true,size:TITLE_SIZE}))
   const meta=[item.location,item.dates].filter(value=>value.trim()).join('  |  ')
   if(meta)body.push(paragraph(meta,{italic:true}))
   for(const line of linesOf(item.description))body.push(paragraph(`• ${line}`))
  }
 }
 const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr/></w:body></w:document>`
 const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
 const relationships=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
 const encoder=new TextEncoder()
 const blob=createZip([{name:'[Content_Types].xml',data:encoder.encode(contentTypes)},{name:'_rels/.rels',data:encoder.encode(relationships)},{name:'word/document.xml',data:encoder.encode(document)}])
 const bytes=new Uint8Array(await blob.arrayBuffer())
 if(bytes.length>4_000_000)throw new HttpError(413,'This Word document is too large. Shorten the resume and retry.')
 return bytes
}
