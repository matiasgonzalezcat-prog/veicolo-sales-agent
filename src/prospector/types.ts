/**
 * Tipos compartidos del Prospector
 */

/** Un negocio encontrado por el prospector antes de ser guardado */
export interface NegocioEncontrado {
  nombre: string;
  tipo_negocio: 'gomeria' | 'taller_motos' | 'lubricentro' | 'repuestos_motos' | 'otro';
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  provincia?: string;
  instagram?: string;
  facebook?: string;
  google_maps_url?: string;
  website?: string;
  rating?: number;
  cantidad_reviews?: number;
  horarios?: string;
  fuente: string;           // De dónde se sacó la info (google_maps, instagram, directorio, etc.)
  fuente_url?: string;      // URL específica donde se encontró
  verificado: boolean;      // Si se pudo confirmar que existe (tiene Google Maps, IG, etc.)
  notas?: string;
  raw_data?: any;           // Data cruda de la fuente original
}

/** Resultado de una búsqueda del prospector */
export interface ResultadoBusqueda {
  fuente: string;
  query: string;
  zona: string;
  negocios: NegocioEncontrado[];
  total_encontrados: number;
  errores?: string[];
  timestamp: string;
}

/** Configuración de zona para buscar */
export interface ZonaBusqueda {
  ciudad: string;
  departamento?: string;
  provincia: string;
  lat?: number;
  lng?: number;
  radio_km?: number;
}

/** Ciudades y zonas de Córdoba para prospectar */
export const ZONAS_CORDOBA: ZonaBusqueda[] = [
  // Ciudades grandes
  { ciudad: 'Córdoba Capital', departamento: 'Capital', provincia: 'Córdoba', lat: -31.4201, lng: -64.1888, radio_km: 15 },
  { ciudad: 'Río Cuarto', departamento: 'Río Cuarto', provincia: 'Córdoba', lat: -33.1307, lng: -64.3499, radio_km: 10 },
  { ciudad: 'Villa María', departamento: 'General San Martín', provincia: 'Córdoba', lat: -32.4075, lng: -63.2428, radio_km: 8 },
  { ciudad: 'San Francisco', departamento: 'San Justo', provincia: 'Córdoba', lat: -31.4283, lng: -62.0826, radio_km: 8 },
  { ciudad: 'Villa Carlos Paz', departamento: 'Punilla', provincia: 'Córdoba', lat: -31.4241, lng: -64.4978, radio_km: 5 },
  { ciudad: 'Jesús María', departamento: 'Colón', provincia: 'Córdoba', lat: -30.9816, lng: -64.0947, radio_km: 5 },
  { ciudad: 'Alta Gracia', departamento: 'Santa María', provincia: 'Córdoba', lat: -31.6652, lng: -64.4327, radio_km: 5 },
  { ciudad: 'Bell Ville', departamento: 'Unión', provincia: 'Córdoba', lat: -32.6255, lng: -62.6921, radio_km: 5 },
  { ciudad: 'Marcos Juárez', departamento: 'Marcos Juárez', provincia: 'Córdoba', lat: -32.6906, lng: -62.1042, radio_km: 5 },

  // Ciudades medianas
  { ciudad: 'Río Tercero', departamento: 'Tercero Arriba', provincia: 'Córdoba', lat: -32.1731, lng: -64.1139, radio_km: 5 },
  { ciudad: 'Cruz del Eje', departamento: 'Cruz del Eje', provincia: 'Córdoba', lat: -30.7267, lng: -64.8067, radio_km: 5 },
  { ciudad: 'Cosquín', departamento: 'Punilla', provincia: 'Córdoba', lat: -31.2447, lng: -64.4661, radio_km: 5 },
  { ciudad: 'La Falda', departamento: 'Punilla', provincia: 'Córdoba', lat: -31.0892, lng: -64.4900, radio_km: 5 },
  { ciudad: 'Villa Dolores', departamento: 'San Javier', provincia: 'Córdoba', lat: -31.9450, lng: -65.1892, radio_km: 5 },
  { ciudad: 'Dean Funes', departamento: 'Ischilín', provincia: 'Córdoba', lat: -30.4217, lng: -64.3500, radio_km: 5 },
  { ciudad: 'Laboulaye', departamento: 'Presidente Roque Sáenz Peña', provincia: 'Córdoba', lat: -34.1267, lng: -63.3917, radio_km: 5 },
  { ciudad: 'Arroyito', departamento: 'San Justo', provincia: 'Córdoba', lat: -31.4192, lng: -63.0500, radio_km: 5 },
  { ciudad: 'Oncativo', departamento: 'Río Segundo', provincia: 'Córdoba', lat: -31.9117, lng: -63.6833, radio_km: 5 },
  { ciudad: 'Villa Allende', departamento: 'Colón', provincia: 'Córdoba', lat: -31.2950, lng: -64.2950, radio_km: 5 },
  { ciudad: 'Unquillo', departamento: 'Colón', provincia: 'Córdoba', lat: -31.2317, lng: -64.3233, radio_km: 5 },
  { ciudad: 'Río Segundo', departamento: 'Río Segundo', provincia: 'Córdoba', lat: -31.6517, lng: -63.9117, radio_km: 5 },
  { ciudad: 'Villa del Rosario', departamento: 'Río Segundo', provincia: 'Córdoba', lat: -31.5583, lng: -63.5333, radio_km: 5 },
  { ciudad: 'Morteros', departamento: 'San Justo', provincia: 'Córdoba', lat: -30.7117, lng: -62.0050, radio_km: 5 },
  { ciudad: 'Las Varillas', departamento: 'San Justo', provincia: 'Córdoba', lat: -31.8717, lng: -62.7217, radio_km: 5 },
  { ciudad: 'Hernando', departamento: 'Tercero Arriba', provincia: 'Córdoba', lat: -32.4250, lng: -63.7350, radio_km: 5 },
  { ciudad: 'Oliva', departamento: 'Tercero Arriba', provincia: 'Córdoba', lat: -32.0383, lng: -63.5650, radio_km: 5 },
  { ciudad: 'Villa Nueva', departamento: 'General San Martín', provincia: 'Córdoba', lat: -32.4333, lng: -63.2500, radio_km: 5 },
  { ciudad: 'Leones', departamento: 'Marcos Juárez', provincia: 'Córdoba', lat: -32.6600, lng: -62.2983, radio_km: 5 },
  { ciudad: 'Mina Clavero', departamento: 'San Alberto', provincia: 'Córdoba', lat: -31.7217, lng: -65.0050, radio_km: 5 },
];

/** Tipos de negocio que buscamos y sus keywords */
export const KEYWORDS_BUSQUEDA: Record<string, string[]> = {
  gomeria: [
    'gomeria', 'gomerías', 'gomería', 'vulcanización', 'vulcanizacion',
    'neumáticos', 'neumaticos', 'cubiertas moto', 'cubiertas de moto'
  ],
  taller_motos: [
    'taller de motos', 'mecánica de motos', 'mecanica de motos',
    'taller motos', 'reparación motos', 'reparacion motos',
    'servicio técnico motos', 'service motos'
  ],
  lubricentro: [
    'lubricentro', 'cambio de aceite', 'lubricantes'
  ],
  repuestos_motos: [
    'repuestos de motos', 'repuestos motos', 'accesorios motos',
    'cascos', 'moto parts', 'moto repuestos'
  ]
};
