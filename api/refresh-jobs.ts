import { runObservedRequest } from '../server/observability.js'
import { refreshJobsAutomatically } from '../server/jobs/auto-refresh.js'
export default { fetch(request: Request) { return runObservedRequest('refresh-jobs','jobs',()=>refreshJobsAutomatically(request)) } }
