import { Schema, model } from 'mongoose';

const dmSchema = new Schema(
  {
    from: { type: String, required: true }, // publicId
    to: { type: String, required: true }, // publicId
    text: { type: String, required: true, maxlength: 1000 },
    read: { type: Boolean, default: false },
    editedAt: { type: Date },
    /** Earlier versions (oldest first). Only the two people in the conversation ever see them. */
    edits: { type: [{ text: String, editedAt: Date, _id: false }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

dmSchema.index({ from: 1, to: 1, createdAt: -1 });
dmSchema.index({ to: 1, read: 1 });

export const DirectMessage = model('DirectMessage', dmSchema);
