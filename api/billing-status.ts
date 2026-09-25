import { runObservedRequest } from '../server/observability.js'
import { billingStatus } from '../server/billing/handlers.js'
export default { fetch(request: Request) { return runObservedRequest('billing-status', 'entitlement', () => billingStatus(request)) } }
