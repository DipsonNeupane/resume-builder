import { HttpError } from '../http/security.ts'

export const JOB_DECISIONS = ['review', 'pursue', 'pass'] as const
export const APPLICATION_STATUSES = ['not_applied', 'preparing', 'applied', 'interviewing', 'offer', 'closed', 'withdrawn'] as const

export type JobDecision = typeof JOB_DECISIONS[number]
export type ApplicationStatus = typeof APPLICATION_STATUSES[number]

export type JobWorkflow = {
  savedJobId: string
  decision: JobDecision
  applicationStatus: ApplicationStatus
  notes: string
  contactName: string
  contactDetails: string
  reminderEnabled: boolean
  reminderAt: string | null
  revision: number
  updatedAt: string
  history: { decision: JobDecision; applicationStatus: ApplicationStatus; changedAt: string }[]
}

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
}

function timestamp(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value)))
}

export type JobWorkflowInput = Pick<JobWorkflow, 'decision' | 'applicationStatus' | 'notes' | 'contactName' | 'contactDetails' | 'reminderEnabled' | 'reminderAt'>

export function parseJobWorkflowInput(value: unknown): JobWorkflowInput {
  if (!record(value)
    || typeof value.decision !== 'string' || !(JOB_DECISIONS as readonly string[]).includes(value.decision)
    || typeof value.applicationStatus !== 'string' || !(APPLICATION_STATUSES as readonly string[]).includes(value.applicationStatus)
    || !text(value.notes, 4000) || !text(value.contactName, 200) || !text(value.contactDetails, 500)
    || typeof value.reminderEnabled !== 'boolean' || !timestamp(value.reminderAt)
    || (value.reminderEnabled && value.reminderAt === null)
    || (!value.reminderEnabled && value.reminderAt !== null)) {
    throw new HttpError(400, 'Job workflow is invalid')
  }
  return {
    decision: value.decision as JobDecision,
    applicationStatus: value.applicationStatus as ApplicationStatus,
    notes: value.notes,
    contactName: value.contactName,
    contactDetails: value.contactDetails,
    reminderEnabled: value.reminderEnabled,
    reminderAt: value.reminderAt,
  }
}

export function parseJobWorkflow(value: unknown): JobWorkflow {
  if (!record(value) || typeof value.savedJobId !== 'string' || !UUID.test(value.savedJobId)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || typeof value.updatedAt !== 'string' || Number.isNaN(Date.parse(value.updatedAt))
    || !Array.isArray(value.history) || value.history.length > 100
    || !value.history.every(item => record(item)
      && typeof item.decision === 'string' && (JOB_DECISIONS as readonly string[]).includes(item.decision)
      && typeof item.applicationStatus === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(item.applicationStatus)
      && typeof item.changedAt === 'string' && !Number.isNaN(Date.parse(item.changedAt)))) {
    throw new HttpError(503, 'Job workflow returned an unusable response')
  }
  return { savedJobId: value.savedJobId, revision: value.revision as number, updatedAt: value.updatedAt, history: value.history as JobWorkflow['history'], ...parseJobWorkflowInput(value) }
}
