import { Schema, model } from 'mongoose';
import { AUDIT_TYPES } from '../../../shared/types';

/** Admin audit trail. Private messages are never recorded here. Entries expire after 90 days. */
const auditEventSchema = new Schema(
  {
    type: { type: String, enum: AUDIT_TYPES, required: true },
    actorId: { type: String }, // publicId
    actorName: { type: String },
    targetId: { type: String }, // publicId
    targetName: { type: String },
    roomId: { type: String },
    detail: { type: String, maxlength: 400 },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ type: 1, createdAt: -1 });
auditEventSchema.index({ actorId: 1, createdAt: -1 });
auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const AuditEvent = model('AuditEvent', auditEventSchema);
