import type { BuildingSummary } from '@shared/types';
import type { Feature, FeatureCollection } from 'geojson';
import L, { type LatLngBoundsExpression, type Layer, type Map as LeafletMap, type PathOptions } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { roomIdForFeature, type FeatureProps } from '@shared/buildingMatch';
import BuildingCard from './BuildingCard';

// Fallback view of the main CPP campus, used until building outlines load.
const CAMPUS_BOUNDS: LatLngBoundsExpression = [
  [34.0515, -117.8295],
  [34.0625, -117.8135],
];

interface Props {
  buildings: BuildingSummary[];
  selectedId: string | null;
  onSelect: (buildingId: string | null) => void;
}

/** Building footprints come from client/public/buildings.geojson (run `npm run fetch:buildings`). */
export default function CampusMap({ buildings, selectedId, onSelect }: Props) {
  const [shapes, setShapes] = useState<FeatureCollection | null>(null);
  const [missing, setMissing] = useState(false);
  const [map, setMap] = useState<LeafletMap | null>(null);
  // Bumped on every map click so clicking the same building again reopens its popup.
  const [clickSeq, setClickSeq] = useState(0);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    fetch('/buildings.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setShapes)
      .catch(() => setMissing(true));
  }, []);

  // Which chatroom each outline belongs to (null = not a building we have a room for).
  const roomOf = useMemo(() => {
    const m = new Map<Feature, string | null>();
    for (const f of shapes?.features ?? []) m.set(f, roomIdForFeature(f.properties as FeatureProps, buildings));
    return m;
  }, [shapes, buildings]);

  // Centre point of each matched building, used for the popup and for flying to it from the list.
  const centers = useMemo(() => {
    const c = new Map<string, L.LatLng>();
    for (const [f, id] of roomOf) if (id && !c.has(id)) c.set(id, L.geoJSON(f).getBounds().getCenter());
    return c;
  }, [roomOf]);

  // Keep the map on campus: fit to the matched buildings, don't allow panning or zooming far away.
  useEffect(() => {
    if (!map) return;
    const matched = [...roomOf].filter(([, id]) => id).map(([f]) => f);
    const bounds = matched.length ? L.geoJSON({ type: 'FeatureCollection', features: matched } as FeatureCollection).getBounds() : L.latLngBounds(CAMPUS_BOUNDS);
    map.fitBounds(bounds, { padding: [20, 20] });
    map.setMaxBounds(bounds.pad(0.25));
    map.setMinZoom(map.getBoundsZoom(bounds.pad(0.25)));
  }, [map, roomOf]);

  // Selecting from the sidebar list flies to the building.
  useEffect(() => {
    const c = selectedId ? centers.get(selectedId) : undefined;
    if (map && c) map.flyTo(c, Math.max(map.getZoom(), 17), { duration: 0.6 });
  }, [map, selectedId, centers]);

  const counts = new Map(buildings.map((b) => [b.id, b.onlineCount]));

  const style = (f?: Feature): PathOptions => {
    const id = f ? roomOf.get(f) : null;
    if (!id) return { color: '#b5b5b5', weight: 1, fillColor: '#d6d6d6', fillOpacity: 0.5 };
    const selected = id === selectedId;
    return {
      color: selected ? '#FFB500' : '#1E4D2B',
      weight: selected ? 3 : 1.5,
      fillColor: (counts.get(id) ?? 0) > 0 ? '#3c8d5a' : '#1E4D2B',
      fillOpacity: selected ? 0.75 : 0.5,
    };
  };

  const onEachFeature = (f: Feature, layer: Layer) => {
    const id = roomOf.get(f);
    const b = id ? buildings.find((x) => x.id === id) : undefined;
    const label = b ? `${b.number} · ${b.name}` : (f.properties as FeatureProps | null)?.name;
    if (label) layer.bindTooltip(label, { sticky: true });
    if (id) {
      layer.on('click', () => {
        onSelect(id);
        setClickSeq((n) => n + 1);
      });
      layer.on('mouseover', () => (layer as L.Path).setStyle({ weight: 3 }));
      layer.on('mouseout', () => (layer as L.Path).setStyle(style(f)));
    }
  };

  const selected = buildings.find((b) => b.id === selectedId);
  const popupAt = selectedId ? centers.get(selectedId) : undefined;

  return (
    <div className="map-wrap">
      <MapContainer
        ref={setMap}
        bounds={CAMPUS_BOUNDS}
        maxZoom={20}
        maxBoundsViscosity={1}
        className="campus-map"
      >
        <TileLayer
          // Clean, low-detail basemap so campus buildings stand out. Tiles exist to z19; z20 is upscaled instead of going gray.
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxNativeZoom={19}
          maxZoom={20}
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
        {selected && popupAt && (
          <Popup
            key={`${selected.id}-${clickSeq}`}
            position={popupAt}
            minWidth={240}
            eventHandlers={{
              // Closed by the user (× or clicking elsewhere) — not because another building was picked.
              remove: () => selectedRef.current === selected.id && onSelect(null),
            }}
          >
            <BuildingCard building={selected} />
          </Popup>
        )}
      </MapContainer>
      {selected && !popupAt && (
        // Building has no outline on the map (or outlines aren't loaded): show its card over the map instead.
        <aside className="building-panel" aria-label={`${selected.name} details`}>
          <button className="close" onClick={() => onSelect(null)} aria-label="Close">
            ×
          </button>
          <BuildingCard building={selected} />
        </aside>
      )}
      {missing && (
        <p className="map-note">
          Building outlines not loaded yet — run <code>npm run fetch:buildings</code>. You can still pick a building from
          the list.
        </p>
      )}
    </div>
  );
}
