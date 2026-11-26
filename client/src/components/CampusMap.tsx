import { roomIdForFeature, type FeatureProps } from '@shared/buildingMatch';
import { BUILDINGS, findRoom } from '@shared/buildings';
import { STATIC_MAP_LINKS } from '@shared/mapLinks';
import type { BuildingSummary } from '@shared/types';
import type { Feature, FeatureCollection } from 'geojson';
import L, { type LatLngBoundsLiteral, type Layer, type Map as LeafletMap, type PathOptions } from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, TileLayer } from 'react-leaflet';
import { ACTIVITY_STEPS, activityColor } from '../lib/activity';
import { api, type MapFixes } from '../lib/api';
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
const isCustom = (f: Feature) => featureId(f).startsWith('custom/');

/** Building footprints come from client/public/buildings.geojson, plus outlines admins drew. */
export default function CampusMap({ buildings, selectedId, onSelect }: Props) {
  const { me } = useSession();
  const [fileShapes, setFileShapes] = useState<FeatureCollection | null>(null);
  const [missing, setMissing] = useState(false);
  const [fixes, setFixes] = useState<MapFixes>({ links: {}, outlines: [] });
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [, setTick] = useState(0); // re-render on pan/zoom so cards follow their building
  const [linking, setLinking] = useState<Feature | null>(null); // admin: outline being linked
  const [drawing, setDrawing] = useState<{ roomId: string; points: L.LatLng[] } | null>(null); // admin: tracing
  const layerClicked = useRef(false);

  const loadFixes = () => {
    api.mapLinks().then(setFixes).catch(() => {});
  };
  useEffect(() => {
    fetch('/buildings.geojson')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then(setFileShapes)
      .catch(() => setMissing(true));
    loadFixes();
  }, []);

  // File outlines + admin-drawn outlines.
  const shapes = useMemo<FeatureCollection | null>(() => {
    if (!fileShapes) return null;
    const drawn: Feature[] = fixes.outlines.map((o) => ({
      type: 'Feature',
      id: `custom/${o.id}`,
      properties: { name: findRoom(o.roomId)?.name ?? null, roomId: o.roomId },
      geometry: { type: 'Polygon', coordinates: [[...o.coordinates, o.coordinates[0]]] },
    }));
    return { type: 'FeatureCollection', features: [...fileShapes.features, ...drawn] };
  }, [fileShapes, fixes.outlines]);

  // Which chatroom each outline belongs to: admin link → fixed link → automatic name/number matching.
  // Uses the static building list, so the 15-second people-count refresh doesn't recompute it.
  const roomOf = useMemo(() => {
    const m = new Map<Feature, string | null>();
    for (const f of shapes?.features ?? []) {
      if (isCustom(f)) {
        m.set(f, (f.properties as { roomId: string }).roomId);
        continue;
      }
      const link = fixes.links[featureId(f)] ?? STATIC_MAP_LINKS[featureId(f)];
      m.set(f, link ? (link === 'none' ? null : link) : roomIdForFeature(f.properties as FeatureProps, BUILDINGS));
    }
    return m;
  }, [shapes, fixes.links]);

  // One point per building: the center of all its outlines together (e.g. the Library's three pieces).
  const centers = useMemo(() => {
    const bounds = new Map<string, L.LatLngBounds>();
    for (const [f, id] of roomOf) {
      if (!id) continue;
      const b = L.geoJSON(f).getBounds();
      bounds.set(id, bounds.has(id) ? bounds.get(id)!.extend(b) : b);
    }
    return new Map([...bounds].map(([id, b]) => [id, b.getCenter()]));
  }, [roomOf]);

  // Fit to campus ONCE, when the outlines first load. (Re-fitting on every update caused the auto zoom-out.)
  const fitted = useRef(false);
  useEffect(() => {
    if (!map || !fileShapes || fitted.current) return;
    fitted.current = true;
    const matched = [...roomOf].filter(([, id]) => id).map(([f]) => f);
    const bounds = matched.length
      ? L.geoJSON({ type: 'FeatureCollection', features: matched } as FeatureCollection).getBounds()
      : L.latLngBounds(CAMPUS_BOUNDS);
    map.fitBounds(bounds, { padding: [20, 20] });
    map.setMaxBounds(bounds.pad(0.35));
    map.setMinZoom(map.getBoundsZoom(bounds.pad(0.35)));
  }, [map, fileShapes, roomOf]);

  // Fly to a building only when the selection changes (not on every data refresh).
  const lastFlown = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) {
      lastFlown.current = null;
      return;
    }
    const c = centers.get(selectedId);
    if (!map || !c || lastFlown.current === selectedId) return;
    lastFlown.current = selectedId;
    map.flyTo(c, Math.max(map.getZoom(), 18), { duration: 0.6 });
  }, [map, selectedId, centers]);

  // Handlers read the latest state through a ref, so layers needn't be re-created when it changes.
  const latest = useRef({ roomOf, onSelect, isAdmin: !!me?.isAdmin, drawing });
  latest.current = { roomOf, onSelect, isAdmin: !!me?.isAdmin, drawing };

  // Card follows the building while panning/zooming; clicking empty map closes it (or adds a corner while drawing).
  useEffect(() => {
    if (!map) return;
    const rerender = () => setTick((t) => t + 1);
    const onMapClick = (e: L.LeafletMouseEvent) => {
      const d = latest.current.drawing;
      if (d) {
        setDrawing({ ...d, points: [...d.points, e.latlng] });
        layerClicked.current = false;
        return;
      }
      if (layerClicked.current) {
        layerClicked.current = false;
        return;
      }
      latest.current.onSelect(null);
      setLinking(null);
    };
    map.on('move zoom resize', rerender);
    map.on('click', onMapClick);
    return () => {
      map.off('move zoom resize', rerender);
      map.off('click', onMapClick);
    };
  }, [map]);

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

  const onEachFeature = (f: Feature, layer: Layer) => {
    layer.on('click', () => {
      const { roomOf: r, onSelect: select, isAdmin, drawing: d } = latest.current;
      if (d) return; // the map click handler adds the corner
      const id = r.get(f);
      layerClicked.current = true;
      if (id) {
        setLinking(null);
        select(id);
      } else if (isAdmin && !isCustom(f)) {
        select(null);
        setLinking(f);
      }
    });
    layer.on('mouseover', () => (layer as L.Path).setStyle({ weight: 3 }));
    layer.on('mouseout', () => (layer as L.Path).setStyle({ weight: latest.current.roomOf.get(f) ? 1.5 : 1 }));
    const id = roomOf.get(f);
    const b = id ? findRoom(id) : undefined;
    const tip = b
      ? `${b.number ? `${b.number} · ` : ''}${b.name} — ${people(b.id)} here`
      : ((f.properties as FeatureProps | null)?.name ?? (me?.isAdmin ? 'Unlinked building (click to link)' : ''));
    if (tip) layer.bindTooltip(tip, { sticky: true });
  };

  const selected = selectedId ? byId.get(selectedId) : undefined;
  const anchor = selectedId ? centers.get(selectedId) : undefined;
  const point = map && anchor ? map.latLngToContainerPoint(anchor) : null;
  const linkAnchor = map && linking ? map.latLngToContainerPoint(L.geoJSON(linking).getBounds().getCenter()) : null;
  const drawnFor = (roomId: string) => fixes.outlines.filter((o) => o.roomId === roomId);

  const saveLink = async (roomId: string | null) => {
    if (!linking) return;
    await api.setMapLink(featureId(linking), roomId);
    setLinking(null);
    loadFixes();
    if (roomId && roomId !== 'none') onSelect(roomId);
  };

  const finishDrawing = async () => {
    if (!drawing || drawing.points.length < 3) return;
    const coords = drawing.points.map((p) => [Number(p.lng.toFixed(7)), Number(p.lat.toFixed(7))] as [number, number]);
    await api.addOutline(drawing.roomId, coords);
    const roomId = drawing.roomId;
    setDrawing(null);
    loadFixes();
    lastFlown.current = null;
    onSelect(roomId);
  };

  const currentFeatureFor = (roomId: string) => [...roomOf].find(([f, id]) => id === roomId && !isCustom(f))?.[0];

  const adminTools = (roomId: string) =>
    me?.isAdmin && (
      <div className="admin-tools">
        <button
          className="link"
          onClick={() => {
            onSelect(null);
            setDrawing({ roomId, points: [] });
          }}
        >
          ✏️ Draw {centers.has(roomId) ? 'another piece of its' : 'its'} outline
        </button>
        {currentFeatureFor(roomId) && (
          <button
            className="link"
            onClick={() => {
              const f = currentFeatureFor(roomId);
              if (f) {
                onSelect(null);
                setLinking(f);
              }
            }}
          >
            🔗 Change which outline this is
          </button>
        )}
        {drawnFor(roomId).length > 0 && (
          <button
            className="link"
            onClick={async () => {
              await Promise.all(drawnFor(roomId).map((o) => api.removeOutline(o.id)));
              loadFixes();
            }}
          >
            🗑 Remove drawn outline{drawnFor(roomId).length > 1 ? 's' : ''}
          </button>
        )}
      </div>
    );

  return (
    <div className={`map-wrap ${drawing ? 'is-drawing' : ''}`}>
      <MapContainer
        ref={setMap}
        bounds={CAMPUS_BOUNDS}
        maxZoom={20}
        maxBoundsViscosity={1}
        doubleClickZoom={false}
        className="campus-map"
      >
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
            key={`${selectedId}-${linking ? featureId(linking) : ''}-${buildings.map((b) => people(b.id)).join(',')}-${JSON.stringify(fixes).length}`}
            data={shapes}
            style={style}
            onEachFeature={onEachFeature}
          />
        )}
        {drawing && drawing.points.length >= 3 && (
          <Polygon positions={drawing.points} pathOptions={{ color: '#FFB500', weight: 2, fillOpacity: 0.25, dashArray: '6 4' }} />
        )}
        {drawing && drawing.points.length === 2 && <Polyline positions={drawing.points} pathOptions={{ color: '#FFB500', weight: 2 }} />}
        {drawing?.points.map((p, i) => (
          <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: '#1E4D2B', fillColor: '#FFB500', fillOpacity: 1 }} />
        ))}
      </MapContainer>

      {selected && point && !drawing && (
        <div className="map-card" style={{ left: point.x, top: point.y }}>
          <button className="close" onClick={() => onSelect(null)} aria-label="Close">
            ×
          </button>
          <BuildingCard building={selected} />
          {adminTools(selected.id)}
        </div>
      )}

      {selected && !point && !drawing && (
        // Building has no outline on the map yet.
        <div className="map-card unplaced">
          <button className="close" onClick={() => onSelect(null)} aria-label="Close">
            ×
          </button>
          <BuildingCard building={selected} />
          <p className="hint">This building isn't on the map yet.</p>
          {adminTools(selected.id)}
        </div>
      )}

      {drawing && (
        <div className="map-card unplaced drawing-card">
          <p className="building-number">Admin · drawing outline</p>
          <h2>{findRoom(drawing.roomId)?.name}</h2>
          <p className="hint">Click each corner of the building on the map, in order. {drawing.points.length} corner(s) so far.</p>
          <div className="row">
            <button className="primary" disabled={drawing.points.length < 3} onClick={finishDrawing}>
              Save outline
            </button>
            <button disabled={drawing.points.length === 0} onClick={() => setDrawing({ ...drawing, points: drawing.points.slice(0, -1) })}>
              Undo corner
            </button>
            <button onClick={() => setDrawing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {linking && linkAnchor && !drawing && (
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
            {BUILDINGS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.number ? `${b.number} · ` : ''}
                {b.name}
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
