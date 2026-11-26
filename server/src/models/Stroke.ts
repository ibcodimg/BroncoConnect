import { Schema, model } from 'mongoose';

/** One stroke/shape on a building's collaborative whiteboard. Personal boards stay in the browser. */
const strokeSchema = new Schema(
  {
    roomId: { type: String, required: true, index: true },
    strokeId: { type: String, required: true },
    authorId: { type: String, required: true }, // publicId
    authorName: { type: String },
    // 'eraser' kept only so strokes saved by older versions still load (they're skipped).
    tool: { type: String, enum: ['pen', 'line', 'rect', 'ellipse', 'eraser'], required: true },
    color: { type: String, required: true, maxlength: 20 },
    width: { type: Number, required: true, min: 1, max: 60 },
    points: { type: [{ x: Number, y: Number, _id: false }], required: true },
    /** Unerasable ink: only the author or an admin can erase it. */
    locked: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

strokeSchema.index({ roomId: 1, strokeId: 1 }, { unique: true });
strokeSchema.index({ roomId: 1, authorId: 1, createdAt: -1 });

export const StrokeModel = model('Stroke', strokeSchema);
