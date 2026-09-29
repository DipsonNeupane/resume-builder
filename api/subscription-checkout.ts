import { runObservedRequest } from '../server/observability.js'
import { offerCheckout } from '../server/billing/offer-handlers.js'
export default { fetch(request: Request) { return runObservedRequest('subscription-checkout', 'billing', () => offerCheckout(request)) } }
