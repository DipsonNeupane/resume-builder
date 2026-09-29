import { runObservedRequest } from '../server/observability.js'
import { customerPortal } from '../server/billing/offer-handlers.js'
export default { fetch(request: Request) { return runObservedRequest('customer-portal', 'billing', () => customerPortal(request)) } }
