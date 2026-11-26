import { Schema, model } from 'mongoose';

/** One document per pair. `pair` is the two publicIds sorted and joined, so lookups are order-independent. */
const friendshipSchema = new Schema(
  {
    pair: { type: String, required: true, unique: true },
    requester: { type: String, required: true }, // publicId
    recipient: { type: String, required: true }, // publicId
    status: { type: String, enum: ['pending', 'accepted'], default: 'pending' },
  },
  { timestamps: true },
);

friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

export const pairKey = (a: string, b: string) => [a, b].sort().join(':');
export const Friendship = model('Friendship', friendshipSchema);
