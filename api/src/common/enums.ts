export enum Role {
  Customer = 'customer',
  Agent = 'agent',
  Admin = 'admin',
}

export enum TicketStatus {
  Open = 'open',
  InProgress = 'in_progress',
  WaitingCustomer = 'waiting_customer',
  Resolved = 'resolved',
  Closed = 'closed',
}

export enum Priority {
  Low = 'low',
  Normal = 'normal',
  High = 'high',
  Urgent = 'urgent',
}

export enum Category {
  Billing = 'billing',
  Technical = 'technical',
  Account = 'account',
  Other = 'other',
}

/** Statuses a staff member may move a ticket to, keyed by its current status. */
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.Open]: [TicketStatus.InProgress, TicketStatus.Resolved, TicketStatus.Closed],
  [TicketStatus.InProgress]: [TicketStatus.WaitingCustomer, TicketStatus.Resolved, TicketStatus.Closed],
  [TicketStatus.WaitingCustomer]: [TicketStatus.InProgress, TicketStatus.Resolved, TicketStatus.Closed],
  [TicketStatus.Resolved]: [TicketStatus.Open, TicketStatus.Closed],
  [TicketStatus.Closed]: [],
};

/** SLA targets in hours: [first response, resolution]. */
export const SLA_HOURS: Record<Priority, [number, number]> = {
  [Priority.Urgent]: [1, 4],
  [Priority.High]: [4, 24],
  [Priority.Normal]: [8, 48],
  [Priority.Low]: [24, 72],
};
