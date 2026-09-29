import { runObservedRequest } from '../server/observability.js'
import { cancelOffer } from '../server/billing/offer-handlers.js'
export default { fetch(request: Request) { return runObservedRequest('cancel-offer', 'billing', () => cancelOffer(request)) } }
