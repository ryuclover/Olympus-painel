import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Lead } from '../../data/leads.mock';
import 'leaflet/dist/leaflet.css';
import './LeadMap.css';

// Fix Leaflet default icon broken by Vite's asset hashing
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom colored pin icons based on score
const createScoreIcon = (score: number) => {
  let color = '#6b7280'; // gray = cold
  if (score >= 70) color = '#10b981'; // green = hot
  else if (score >= 40) color = '#f59e0b'; // yellow = warm

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32" stroke="white" stroke-width="1.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>`;
  
  return L.divIcon({
    className: 'custom-leaflet-icon',
    html: svg,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34]
  });
};

interface LeadMapProps {
  leads: Lead[];
  centerLat?: number;
  centerLng?: number;
  radiusKm: number;
  onLeadClick: (lead: Lead) => void;
}

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => { map.setView(center); }, [center, map]);
  return null;
}

export function LeadMap({ leads, centerLat, centerLng, radiusKm, onLeadClick }: LeadMapProps) {
  const [mapCenter, setMapCenter] = useState<[number, number]>([-15.7801, -47.9292]); // Brasil center
  const [geocoding, setGeocoding] = useState(false);
  const [geocodingResult, setGeocodingResult] = useState<string | null>(null);

  const leadsComCoords = leads.filter(l => l.lat && l.lng && Math.abs(l.lat) > 0.001 && Math.abs(l.lng) > 0.001);
  const semCoords = leads.length - leadsComCoords.length;

  useEffect(() => {
    if (centerLat && centerLng && Math.abs(centerLat) > 0.001) {
      setMapCenter([centerLat, centerLng]);
    } else if (leadsComCoords.length > 0) {
      const sumLat = leadsComCoords.reduce((s, l) => s + l.lat, 0);
      const sumLng = leadsComCoords.reduce((s, l) => s + l.lng, 0);
      setMapCenter([sumLat / leadsComCoords.length, sumLng / leadsComCoords.length]);
    }
  }, [centerLat, centerLng, leads]);

  const handleGeocodificar = async () => {
    setGeocoding(true);
    setGeocodingResult(null);
    try {
      const res = await fetch('/api/leads/geocodificar', { method: 'POST' });
      const data = await res.json();
      setGeocodingResult(`✓ ${data.atualizados} leads geocodificados! Recarregue a página para ver no mapa.`);
    } catch {
      setGeocodingResult('Erro ao geocodificar. Tente novamente.');
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <div className="lead-map-wrapper">
      {/* Banner de aviso quando leads não têm coordenadas */}
      {semCoords > 0 && (
        <div className="map-geocode-banner">
          <span>
            ⚠️ <strong>{semCoords}</strong> lead{semCoords > 1 ? 's' : ''} sem coordenadas — não aparecem no mapa.
          </span>
          {geocodingResult ? (
            <span className="geocode-success">{geocodingResult}</span>
          ) : (
            <button
              className="btn-geocode"
              onClick={handleGeocodificar}
              disabled={geocoding}
            >
              {geocoding ? '⏳ Geocodificando... (pode demorar)' : '📍 Geocodificar pelo endereço'}
            </button>
          )}
        </div>
      )}

      {/* Contador de pinos visíveis */}
      {leadsComCoords.length > 0 && (
        <div className="map-pin-counter">
          📍 {leadsComCoords.length} lead{leadsComCoords.length > 1 ? 's' : ''} no mapa
        </div>
      )}

      <div className="lead-map-container">
        <MapContainer
          center={mapCenter}
          zoom={leadsComCoords.length > 0 ? 12 : 5}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%', zIndex: 0 }}
        >
          <ChangeView center={mapCenter} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Círculo do raio de busca */}
          <Circle
            center={mapCenter}
            pathOptions={{
              fillColor: '#3b82f6',
              fillOpacity: 0.07,
              color: '#3b82f6',
              weight: 2,
              dashArray: '8, 4',
            }}
            radius={radiusKm * 1000}
          />

          {/* Marcadores dos leads */}
          {leadsComCoords.map((lead) => (
            <Marker
              key={lead.id}
              position={[lead.lat, lead.lng]}
              icon={createScoreIcon(lead.score || 0)}
            >
              <Popup className="lead-map-popup" minWidth={240}>
                <div className="popup-content">
                  {lead.fotoUrl && (
                    <div className="popup-photo-wrapper">
                      <img src={lead.fotoUrl} alt={lead.empresa} className="popup-photo" loading="lazy" />
                    </div>
                  )}
                  <h4>{lead.empresa}</h4>
                  <p className="popup-cat">{lead.categoria}</p>
                  <div className="popup-meta">
                    <span className="popup-rating">★ {lead.avaliacao.toFixed(1)} <span className="popup-reviews">({lead.totalAvaliacoes})</span></span>
                    {lead.score != null && (
                      <span className="popup-score" style={{ color: (lead.score >= 70) ? '#10b981' : (lead.score >= 40) ? '#f59e0b' : '#6b7280' }}>
                        Score: {lead.score}
                      </span>
                    )}
                  </div>
                  {lead.telefone && (
                    <div className="popup-phone-line">
                      <span className="popup-phone">📞 {lead.telefone}</span>
                      {lead.temWhatsapp ? (
                        <span className="badge-wpp-tag">WhatsApp</span>
                      ) : lead.tipoTelefone === "fixo" ? (
                        <span className="badge-fixo-tag">Fixo</span>
                      ) : null}
                    </div>
                  )}
                  {lead.endereco && <p className="popup-addr">📍 {lead.endereco}</p>}

                  <div className="popup-actions">
                    <button className="btn-details" onClick={() => onLeadClick(lead)}>
                      Ver detalhes
                    </button>
                    {lead.telefone && (
                      <a
                        href={`https://wa.me/55${lead.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-whatsapp"
                      >
                        WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </Popup>

            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

