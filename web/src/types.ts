export type Role = 'customer' | 'agent' | 'admin';
export type Status = 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Category = 'billing' | 'technical' | 'account' | 'other';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive?: boolean;
  createdAt?: string;
}

export interface Sla {
  firstResponseDueAt: string;
  resolveDueAt: string;
  firstRespondedAt: string | null;
  firstResponseOverdue: boolean;
  resolveOverdue: boolean;
  overdue: boolean;
}

export interface TicketSummary {
  id: number;
  subject: string;
  status: Status;
  priority: Priority;
  category: Category;
  requester: { id: string; name: string; email: string } | null;
  assignee: { id: string; name: string } | null;
  sla: Sla;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface Comment {
  id: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string; role: Role };
}

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  comments: Comment[];
  attachments: Attachment[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Stats {
  total: number;
  active: number;
  overdue: number;
  unassigned: number;
  avgFirstResponseMinutes: number | null;
  byStatus: Record<Status, number>;
  byPriority: Record<Priority, number>;
  last14Days: { date: string; created: number; resolved: number }[];
}

export interface AuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: string | null;
  createdAt: string;
}
