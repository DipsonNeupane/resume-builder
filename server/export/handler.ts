import {authenticate} from '../http/security.js'
import {serviceDatabase} from '../database.js'
import {renderPdf} from './render.ts'
import {exportDocument,type DocumentExportDependencies} from './document-handler.ts'

const depsDefault:DocumentExportDependencies={authenticate,serviceDatabase,renderDocument:renderPdf}

export function exportPdf(request:Request,env:NodeJS.ProcessEnv=process.env,deps:DocumentExportDependencies=depsDefault):Promise<Response>{
 return exportDocument({format:'pdf',contentType:'application/pdf',filename:'ResumeStride.pdf'},request,env,deps)
}
