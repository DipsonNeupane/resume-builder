import { runObservedRequest } from '../server/observability.js'
import { validatePilotCode } from '../server/billing/offer-handlers.js'

export default {
  fetch(request: Request) {
    return runObservedRequest('pilot-code-validation', 'billing', () => validatePilotCode(request))
  },
}
