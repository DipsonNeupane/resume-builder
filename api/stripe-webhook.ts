import { runObservedRequest } from '../server/observability.js'
import { webhook } from '../server/billing/handlers.js'
export default { fetch(request: Request) { return runObservedRequest('stripe-webhook', 'billing', () => webhook(request)) } }
