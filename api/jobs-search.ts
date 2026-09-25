import { runObservedRequest } from '../server/observability.js'
import { searchJobs } from '../server/jobs/handler.js'
export const maxDuration = 30
export default { fetch(request: Request) { return runObservedRequest('jobs-search', 'jobs', () => searchJobs(request)) } }
