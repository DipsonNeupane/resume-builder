import { runObservedRequest } from '../server/observability.js'
import { exportDocx } from '../server/export/docx-handler.js'
export const maxDuration = 60
export default { fetch(request:Request){return runObservedRequest('export-docx', 'export', () => exportDocx(request))} }
