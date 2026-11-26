import type { AuditType } from '../../../shared/types';
import { AuditEvent } from '../models/AuditEvent';

interface Who {
  publicId: string;
  displayName?: string | null;
}

/** Record an admin-audit event. Never throws (logging must not break the action being logged). */
export function audit(type: AuditType, e: { actor?: Who; target?: Who; roomId?: string; detail?: string } = {}) {
  AuditEvent.create({
    type,
    actorId: e.actor?.publicId,
    actorName: e.actor?.displayName ?? undefined,
    targetId: e.target?.publicId,
    targetName: e.target?.displayName ?? undefined,
    roomId: e.roomId,
    detail: e.detail?.slice(0, 400),
  }).catch((err) => console.error('audit', err));
}
