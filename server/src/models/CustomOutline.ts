import { Schema, model } from 'mongoose';

/** Building outlines drawn by an admin for buildings missing from OpenStreetMap. Coordinates are [lng, lat]. */
const customOutlineSchema = new Schema(
  {
    roomId: { type: String, required: true, maxlength: 60, index: true },
    coordinates: { type: [[Number]], required: true },
    createdBy: { type: String },
  },
  { timestamps: true },
);

export const CustomOutline = model('CustomOutline', customOutlineSchema);
