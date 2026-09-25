import { runObservedRequest } from '../server/observability.js'
import { cancelSubscription } from '../server/billing/cancel.js'
export default { fetch(request: Request) { return runObservedRequest('cancel-subscription', 'billing', () => cancelSubscription(request)) } }
