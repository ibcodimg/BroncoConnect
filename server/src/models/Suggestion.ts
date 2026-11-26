import { Schema, model } from 'mongoose';

/** Feature ideas / feedback from users, reviewed by admins. */
const suggestionSchema = new Schema(
  {
    authorId: { type: String, required: true }, // publicId
    text: { type: String, required: true, maxlength: 2000 },
    status: { type: String, enum: ['open', 'done'], default: 'open' },
  },
  { timestamps: true },
);

suggestionSchema.index({ status: 1, createdAt: -1 });

export const Suggestion = model('Suggestion', suggestionSchema);
