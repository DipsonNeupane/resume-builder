import { runObservedRequest } from '../server/observability.js'
import { exportPdf } from '../server/export/handler.js'
export const maxDuration = 60
export default { fetch(request:Request){return runObservedRequest('export-pdf', 'export', () => exportPdf(request))} }
