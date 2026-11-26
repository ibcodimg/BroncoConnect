import { roomIdForFeature, type FeatureProps } from '@shared/buildingMatch';
import type { BuildingSummary } from '@shared/types';
import type { Feature, FeatureCollection } from 'geojson';
import L, { type LatLngBoundsLiteral, type Layer, type Map as LeafletMap, type PathOptions } from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { ACTIVITY_STEPS, activityColor } from '../lib/activity';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import BuildingCard from './BuildingCard';

// Fallback view of the main CPP campus, used until building outlines load.
const CAMPUS_BOUNDS: LatLngBoundsLiteral = [
  [34.0515, -117.8295],
  [34.0625, -117.8135],
];

interface Props {
  buildings: BuildingSummary[];
  selectedId: string | null;
  onSelect: (buildingId: string | null) => void;
}

const featureId = (f: Feature) => (f.id == null ? '' : String(f.id));

/** Building footprints come from client/public/buildings.geojson (run `npm run fetch:buildings`). */
export default function CampusMap({ buildings, selectedId, onSelect }: Props) {
  const { me } = useSession();
  const [shapes, setShapes] = useState<FeatureCollection | null>(null);
  const [missing, setMissing] = useState(false);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [, setTick] = useState(0); // re-render on pan/zoom so the card follows the building
  const [linking, setLinking] = useState<Feature | null>(null); // admin: outline being linked
  const layerClicked = useRef(false);

  useEffect(() => {
    fetch('/buildings.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setShapes)
      .catch(() => setMissing(true));
    api.mapLinks().then(setLinks).catch(() => {});
  }, []);

  // Which chatroom each outline belongs to: admin link first, then automatic matching.
  const roomOf = useMemo(() => {
    const m = new Map<Feature, string | null>();
    for (const f of shapes?.features ?? []) {
      const link = links[featureId(f)];
      m.set(f, link ? (link === 'none' ? null : link) : roomIdForFeature(f.properties as FeatureProps, buildings));
    }
    return m;
  }, [shapes, buildings, links]);

  const centers = useMemo(() => {
    const c = new Map<string, L.LatLng>();
    for (const [f, id] of roomOf) if (id && !c.has(id)) c.set(id, L.geoJSON(f).getBounds().getCenter());
    return c;
  }, [roomOf]);

  // Keep the map on campus.
  useEffect(() => {
    if (!map) return;
    const matched = [...roomOf].filter(([, id]) => id).map(([f]) => f);
    const bounds = matched.length
      ? L.geoJSON({ type: 'FeatureCollection', features: matched } as FeatureCollection).getBounds()
      : L.latLngBounds(CAMPUS_BOUNDS);
    map.fitBounds(bounds, { padding: [20, 20] });
    map.setMaxBounds(bounds.pad(0.25));
    map.setMinZoom(map.getBoundsZoom(bounds.pad(0.25)));
  }, [map, roomOf]);

  // Card follows the building while panning/zooming; clicking empty map closes it.
  useEffect(() => {
    if (!map) return;
    const rerender = () => setTick((t) => t + 1);
    const onMapClick = () => {
      if (layerClicked.current) {
        layerClicked.current = false;
        return;
      }
      onSelect(null);
      setLinking(null);
    };
    map.on('move zoom resize', rerender);
    map.on('click', onMapClick);
    return () => {
      map.off('move zoom resize', rerender);
      map.off('click', onMapClick);
    };
  }, [map, onSelect]);

  // Selecting (from the map or the sidebar list) flies to the building.
  useEffect(() => {
    const c = selectedId ? centers.get(selectedId) : undefined;
    if (map && c) map.flyTo(c, Math.max(map.getZoom(), 18), { duration: 0.6 });
  }, [map, selectedId, centers]);

  const byId = useMemo(() => new Map(buildings.map((b) => [b.id, b])), [buildings]);
  const people = (id: string) => (byId.get(id)?.onlineCount ?? 0) + (byId.get(id)?.onCampusNow ?? 0);

  const style = (f?: Feature): PathOptions => {
    const id = f ? roomOf.get(f) : null;
    if (!id) {
      const isLinking = linking && f && featureId(f) === featureId(linking);
      return { color: isLinking ? '#FFB500' : '#b5b5b5', weight: isLinking ? 3 : 1, fillColor: '#d6d6d6', fillOpacity: 0.5 };
    }
    const selected = id === selectedId;
    return {
      color: selected ? '#FFB500' : '#1E4D2B',
      weight: selected ? 3 : 1.5,
      fillColor: activityColor(people(id)),
      fillOpacity: selected ? 0.9 : 0.75,
    };
  };

  // Handlers read the latest state through a ref, so layers don't need re-creating when it changes.
  const latest = useRef({ roomOf, onSelect, isAdmin: !!me?.isAdmin });
  latest.current = { roomOf, onSelect, isAdmin: !!me?.isAdmin };

  const onEachFeature = useCallback(
    (f: Feature, layer: Layer) => {
      layer.on('click', () => {
        const { roomOf: r, onSelect: select, isAdmin } = latest.current;
        const id = r.get(f);
        layerClicked.current = true;
        if (id) {
          setLinking(null);
          select(id);
        } else if (isAdmin) {
          select(null);
          setLinking(f);
        }
      });
      layer.on('mouseover', () => (layer as L.Path).setStyle({ weight: 3 }));
      layer.on('mouseout', () => (layer as L.Path).setStyle({ weight: latest.current.roomOf.get(f) ? 1.5 : 1 }));
    },
    [],
  );

  // Tooltips reflect current names/counts.
  const tooltip = (f: Feature) => {
    const id = roomOf.get(f);
    const b = id ? byId.get(id) : undefined;
    if (b) return `${b.number} · ${b.name} — ${people(b.id)} here`;
    return (f.properties as FeatureProps | null)?.name ?? (me?.isAdmin ? 'Unlinked building (click to link)' : '');
  };

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const anchor = selectedId ? centers.get(selectedId) : undefined;
  const point = map && anchor ? map.latLngToContainerPoint(anchor) : null;
  const linkAnchor = map && linking ? map.latLngToContainerPoint(L.geoJSON(linking).getBounds().getCenter()) : null;

  const saveLink = async (roomId: string | null) => {
    if (!linking) return;
    const id = featureId(linking);
    await api.setMapLink(id, roomId);
    setLinks((prev) => {
      const next = { ...prev };
      if (roomId === null) delete next[id];
      else next[id] = roomId;
      return next;
    });
    setLinking(null);
    if (roomId && roomId !== 'none') onSelect(roomId);
  };

  const currentFeatureFor = (roomId: string) => [...roomOf].find(([, id]) => id === roomId)?.[0];

  return (
    <div className="map-wrap">
      <MapContainer ref={setMap} bounds={CAMPUS_BOUNDS} maxZoom={20} maxBoundsViscosity={1} className="campus-map">
        <TileLayer
          // Standard OpenStreetMap tiles (no API key), washed out with CSS so buildings stand out.
          // Tiles exist to z19; z20 is upscaled instead of going gray.
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxNativeZoom={19}
          maxZoom={20}
        />
        {shapes && (
          <GeoJSON
            // Re-create layers when colors/labels change.
            key={`${selectedId}-${linking ? featureId(linking) : ''}-${buildings.map((b) => people(b.id)).join(',')}-${Object.keys(links).length}`}
            data={shapes}
            style={style}
            onEachFeature={(f, layer) => {
              onEachFeature(f, layer);
              const t = tooltip(f);
              if (t) layer.bindTooltip(t, { sticky: true });
            }}
          />
        )}
      </MapContainer>

      {selected && point && (
        <div className="map-card" style={{ left: point.x, top: point.y }}>
          <button className="close" onClick={() => onSelect(null)} aria-label="Close">
            ×
          </button>
          <BuildingCard building={selected} />
          {me?.isAdmin && (
            <button
              className="link admin-link"
              onClick={() => {
                const f = currentFeatureFor(selected.id);
                if (f) {
                  onSelect(null);
                  setLinking(f);
                }
              }}
            >
              🛡 Change which outline this is
            </button>
          )}
        </div>
      )}

      {selected && !point && (
        // Building has no outline on the map yet.
        <div className="map-card unplaced">
          <button className="close" onClick={() => onSelect(null)} aria-label="Close">
            ×
          </button>
          <BuildingCard building={selected} />
          <p className="hint">
            This building isn't on the map yet.{me?.isAdmin ? ' Admin: click its gray outline to link it.' : ''}
          </p>
        </div>
      )}

      {linking && linkAnchor && (
        <div className="map-card" style={{ left: linkAnchor.x, top: linkAnchor.y }}>
          <button className="close" onClick={() => setLinking(null)} aria-label="Close">
            ×
          </button>
          <p className="building-number">Admin · link outline</p>
          <p className="hint">{(linking.properties as FeatureProps | null)?.name ?? 'Unnamed building'}</p>
          <select
            defaultValue=""
            onChange={(e) => e.target.value && saveLink(e.target.value === 'auto' ? null : e.target.value)}
            aria-label="Chatroom for this outline"
          >
            <option value="" disabled>
              Choose its chatroom…
            </option>
            {buildings
              .filter((b) => b.id !== 'campus')
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number} · {b.name}
                </option>
              ))}
            <option value="none">Not a chatroom building</option>
            <option value="auto">Automatic (undo my link)</option>
          </select>
        </div>
      )}

      <div className="map-legend" aria-label="Legend">
        <strong>People here</strong>
        {ACTIVITY_STEPS.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} /> {s.label}
          </span>
        ))}
      </div>

      {missing && (
        <p className="map-note">
          Building outlines not loaded yet — run <code>npm run fetch:buildings</code>. You can still pick a building from
          the list.
        </p>
      )}
    </div>
  );
}
