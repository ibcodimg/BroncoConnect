import { Schema, model } from 'mongoose';

const messageSchema = new Schema(
  {
    roomId: { type: String, required: true, index: true },
    authorId: { type: String, required: true }, // publicId
    authorName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ roomId: 1, createdAt: -1 });

export const Message = model('Message', messageSchema);
