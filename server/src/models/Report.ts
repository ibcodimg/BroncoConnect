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
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });

export const Report = model('Report', reportSchema);
