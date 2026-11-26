import { Schema, model } from 'mongoose';
import { REPORT_REASONS } from '../../../shared/types';

const reportSchema = new Schema(
  {
    reporterId: { type: String, required: true }, // publicId
    targetId: { type: String }, // publicId; empty for general (bug/problem) reports
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 1000 },
    roomId: { type: String },
    /** Snapshot of the target's recent messages in that room, so evidence survives deletion. */
    context: { type: [{ text: String, createdAt: Date, _id: false }], default: [] },
    /** Set when a specific message was reported. */
    messageKind: { type: String, enum: ['chat', 'dm'] },
    messageId: { type: String },
    /** Reported message + up to 5 before/after (snapshot; DMs only from the reporter's own conversation). */
    surrounding: {
      type: [{ authorId: String, authorName: String, text: String, createdAt: Date, reported: Boolean, edits: [String], _id: false }],
      default: [],
    },
    /** Reported person's recent drawings at report time: [{ roomId, strokes }]. */
    drawings: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });

export const Report = model('Report', reportSchema);
