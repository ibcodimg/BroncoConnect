import { Schema, model } from 'mongoose';

const banSchema = new Schema(
  {
    kind: { type: String, enum: ['user', 'ip'], required: true },
    /** publicId for user bans, IP address for IP bans */
    value: { type: String, required: true },
    reason: { type: String, maxlength: 300 },
    /** null = permanent */
    until: { type: Date, default: null },
    createdBy: { type: String }, // admin publicId
    liftedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

banSchema.index({ kind: 1, value: 1 });

export const Ban = model('Ban', banSchema);
