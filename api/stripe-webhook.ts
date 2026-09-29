import { runObservedRequest } from '../server/observability.js'
import { webhook } from '../server/billing/handlers.js'
import { dispatchPendingNotices } from '../server/billing/notices.js'
export default { fetch(request: Request) { return runObservedRequest('stripe-webhook', 'billing', async () => {
  const response = await webhook(request)
  if (response.ok) await dispatchPendingNotices()
  return response
}) } }
