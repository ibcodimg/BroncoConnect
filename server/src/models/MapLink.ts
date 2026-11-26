import { Schema, model } from 'mongoose';

/**
 * Admin overrides for which chatroom a map outline belongs to.
 * featureId is the OpenStreetMap id from buildings.geojson (e.g. "way/123456").
 * roomId 'none' = "this outline is not a chatroom building" (overrides the automatic match).
 */
const mapLinkSchema = new Schema(
  {
    featureId: { type: String, required: true, unique: true, maxlength: 40 },
    roomId: { type: String, required: true, maxlength: 40 },
  },
  { timestamps: true },
);

export const MapLink = model('MapLink', mapLinkSchema);
