import type { BuildingSummary } from '@shared/types';
import type { Feature, FeatureCollection } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { useEffect, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';

// Center of Cal Poly Pomona.
const CPP_CENTER: [number, number] = [34.0577, -117.8215];

interface Props {
  buildings: BuildingSummary[];
  selectedId: string | null;
  onSelect: (buildingId: string) => void;
}

/** Building footprints come from client/public/buildings.geojson (run `npm run fetch:buildings`). */
export default function CampusMap({ buildings, selectedId, onSelect }: Props) {
  const [shapes, setShapes] = useState<FeatureCollection | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch('/buildings.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setShapes)
      .catch(() => setMissing(true));
  }, []);

  const known = new Set(buildings.map((b) => b.id));
  const idOf = (f?: Feature) => `building-${f?.properties?.ref ?? ''}`;

  const style = (f?: Feature): PathOptions => {
    const id = idOf(f);
    const selected = id === selectedId;
    const active = (buildings.find((b) => b.id === id)?.onlineCount ?? 0) > 0;
    return {
      color: selected ? '#FFB500' : '#1E4D2B',
      weight: selected ? 3 : 1,
      fillColor: active ? '#3c8d5a' : known.has(id) ? '#1E4D2B' : '#8a8a8a',
      fillOpacity: selected ? 0.7 : known.has(id) ? 0.45 : 0.15,
    };
  };

  const onEachFeature = (f: Feature, layer: Layer) => {
    const id = idOf(f);
    const name = buildings.find((b) => b.id === id)?.name ?? f.properties?.name;
    if (f.properties?.ref) layer.bindTooltip(`${f.properties.ref}${name ? ` · ${name}` : ''}`);
    if (known.has(id)) layer.on('click', () => onSelect(id));
  };

  return (
    <div className="map-wrap">
      <MapContainer center={CPP_CENTER} zoom={16} minZoom={15} maxZoom={19} className="campus-map">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {shapes && (
          <GeoJSON
            // Re-create layers when selection/counts change so styles and handlers stay current.
            key={`${selectedId}-${buildings.map((b) => b.onlineCount).join(',')}`}
            data={shapes}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}
      </MapContainer>
      {missing && (
        <p className="map-note">
          Building outlines not loaded yet — run <code>npm run fetch:buildings</code>. You can still pick a building from
          the list.
        </p>
      )}
    </div>
  );
}
