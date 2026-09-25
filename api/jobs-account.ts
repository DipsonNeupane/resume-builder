import { runObservedRequest } from '../server/observability.js'
import { jobsAccount } from '../server/jobs/account.js'
export default { fetch(request: Request) { return runObservedRequest('jobs-account', 'jobs', () => jobsAccount(request)) } }
