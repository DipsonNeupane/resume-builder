import { runObservedRequest } from '../server/observability.js'
import { subscriptionStatus } from '../server/billing/offer-handlers.js'
export default { fetch(request: Request) { return runObservedRequest('subscription-status', 'billing', () => subscriptionStatus(request)) } }
