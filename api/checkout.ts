import { runObservedRequest } from '../server/observability.js'
import { checkout } from '../server/billing/handlers.js'
export default { fetch(request: Request) { return runObservedRequest('checkout', 'billing', () => checkout(request)) } }
