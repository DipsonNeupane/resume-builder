import {authenticate} from '../http/security.js'
import {serviceDatabase} from '../database.js'
import {docxMimeType} from '../../src/services/docx-format.js'
import {renderDocx} from './docx.ts'
import {exportDocument,type DocumentExportDependencies} from './document-handler.ts'

const depsDefault:DocumentExportDependencies={authenticate,serviceDatabase,renderDocument:renderDocx}

export function exportDocx(request:Request,env:NodeJS.ProcessEnv=process.env,deps:DocumentExportDependencies=depsDefault):Promise<Response>{
 return exportDocument({format:'docx',contentType:docxMimeType,filename:'ResumeStride.docx'},request,env,deps)
}
