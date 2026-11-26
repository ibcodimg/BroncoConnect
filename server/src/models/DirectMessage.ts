import { Schema, model } from 'mongoose';

const dmSchema = new Schema(
  {
    from: { type: String, required: true }, // publicId
    to: { type: String, required: true }, // publicId
    text: { type: String, required: true, maxlength: 1000 },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

dmSchema.index({ from: 1, to: 1, createdAt: -1 });
dmSchema.index({ to: 1, read: 1 });

export const DirectMessage = model('DirectMessage', dmSchema);
