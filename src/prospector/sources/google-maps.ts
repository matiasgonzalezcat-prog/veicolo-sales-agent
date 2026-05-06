/**
 * Google Maps / Places — Busca negocios en Google Maps
 *
 * Usa la API de Google Places (Text Search) para encontrar
 * gomerías, talleres, etc. en cada zona de Córdoba.
 *
 * Requiere: GOOGLE_PLACES_API_KEY en .env
 * Free tier: $200/mes de crédito gratis (Google Cloud)
 */

import { NegocioEncontrado, ZonaBusqueda, ResultadoBusqueda, KEYWORDS_BUSQUEDA } from '../types';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY || '';
const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

/** Busca negocios en Google Maps para una zona y tipo */
export async function buscarEnGoogleMaps(
  zona: ZonaBusqueda,
  tipoNegocio: string
): Promise<ResultadoBusqueda> {
  const keywords = KEYWORDS_BUSQUEDA[tipoNegocio] || [tipoNegocio];
  const negocios: NegocioEncontrado[] = [];
  const errores: string[] = [];

  if (!API_KEY) {
    return {
      fuente: 'google_maps',
      query: tipoNegocio,
      zona: zona.ciudad,
      negocios: [],
      total_encontrados: 0,
      errores: ['GOOGLE_PLACES_API_KEY no configurada. Conseguí una gratis en console.cloud.google.com'],
      timestamp: new Date().toISOString()
    };
  }

  // Buscar con cada keyword
  for (const keyword of keywords.slice(0, 3)) { // Máximo 3 keywords por zona para no gastar mucho
    try {
      const query = `${keyword} en ${zona.ciudad}, ${zona.provincia}, Argentina`;
      const results = await textSearch(query, zona);

      for (const place of results) {
        const negocio = await mapearNegocio(place, tipoNegocio, zona, keyword);
        if (negocio) {
          negocios.push(negocio);
        }
      }

      // Respetar rate limits de Google
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error: any) {
      errores.push(`Error buscando "${keyword}" en ${zona.ciudad}: ${error.message}`);
    }
  }

  // Deduplicar por teléfono o nombre+ciudad
  const unicos = deduplicarNegocios(negocios);

  return {
    fuente: 'google_maps',
    query: tipoNegocio,
    zona: zona.ciudad,
    negocios: unicos,
    total_encontrados: unicos.length,
    errores: errores.length > 0 ? errores : undefined,
    timestamp: new Date().toISOString()
  };
}

/** Busca con Text Search API */
async function textSearch(query: string, zona: ZonaBusqueda): Promise<any[]> {
  const params = new URLSearchParams({
    query,
    key: API_KEY,
    language: 'es',
    region: 'ar',
  });

  // Si tenemos coordenadas, agregar location bias
  if (zona.lat && zona.lng) {
    params.set('location', `${zona.lat},${zona.lng}`);
    params.set('radius', `${(zona.radio_km || 10) * 1000}`);
  }

  const response = await fetch(`${BASE_URL}/textsearch/json?${params}`);
  const data: any = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message || ''}`);
  }

  return data.results || [];
}

/** Obtiene detalles de un place (teléfono, horarios, website) */
async function obtenerDetalles(placeId: string): Promise<any> {
  const params = new URLSearchParams({
    place_id: placeId,
    key: API_KEY,
    language: 'es',
    fields: 'formatted_phone_number,international_phone_number,website,opening_hours,url'
  });

  const response = await fetch(`${BASE_URL}/details/json?${params}`);
  const data: any = await response.json();

  if (data.status !== 'OK') {
    return null;
  }

  return data.result;
}

/** Mapea un resultado de Google Places a nuestro formato */
async function mapearNegocio(
  place: any,
  tipoNegocio: string,
  zona: ZonaBusqueda,
  keyword: string
): Promise<NegocioEncontrado | null> {
  // Obtener detalles (teléfono, website, horarios)
  const detalles = await obtenerDetalles(place.place_id);

  // Extraer teléfono
  let telefono = detalles?.international_phone_number || detalles?.formatted_phone_number || '';
  telefono = telefono.replace(/[\s\-\(\)]/g, '');

  // Extraer ciudad de la dirección
  const ciudad = extraerCiudad(place.formatted_address) || zona.ciudad;

  return {
    nombre: place.name,
    tipo_negocio: tipoNegocio as any,
    telefono: telefono || undefined,
    direccion: place.formatted_address,
    ciudad,
    provincia: zona.provincia,
    departamento: zona.departamento,
    google_maps_url: detalles?.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
    website: detalles?.website,
    rating: place.rating,
    cantidad_reviews: place.user_ratings_total,
    horarios: detalles?.opening_hours?.weekday_text?.join(' | '),
    fuente: 'google_maps',
    fuente_url: detalles?.url,
    verificado: true, // Si está en Google Maps, está verificado
    notas: `Encontrado buscando "${keyword}". Rating: ${place.rating || 'sin rating'} (${place.user_ratings_total || 0} reviews)`,
    raw_data: { place_id: place.place_id, types: place.types }
  };
}

/** Extrae la ciudad de una dirección formateada de Google */
function extraerCiudad(direccion: string): string | null {
  if (!direccion) return null;
  // Formato típico: "Av. San Martín 123, X5000 Córdoba, Argentina"
  const partes = direccion.split(',').map(p => p.trim());
  if (partes.length >= 2) {
    // La ciudad suele estar en la penúltima parte, a veces con código postal
    const ciudadPart = partes[partes.length - 2];
    return ciudadPart.replace(/^[A-Z]\d{4}\s*/, '').trim();
  }
  return null;
}

/** Elimina negocios duplicados */
function deduplicarNegocios(negocios: NegocioEncontrado[]): NegocioEncontrado[] {
  const vistos = new Set<string>();
  return negocios.filter(n => {
    // Clave: teléfono si existe, sino nombre+ciudad
    const clave = n.telefono
      ? `tel:${n.telefono.slice(-8)}`
      : `nom:${n.nombre.toLowerCase()}-${n.ciudad?.toLowerCase()}`;

    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

console.log('✅ Fuente Google Maps cargada');
