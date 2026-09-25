import { runObservedRequest } from '../server/observability.js'
import { subscribeCheckout } from '../server/billing/handlers.js'
export default { fetch(request: Request) { return runObservedRequest('subscribe', 'billing', () => subscribeCheckout(request)) } }
