import { runObservedRequest } from '../server/observability.js'
import { dispatchNotices } from '../server/billing/notices.js'
export default { fetch(request: Request) { return runObservedRequest('dispatch-billing-notices', 'billing', () => dispatchNotices(request)) } }
