import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xsnztltwekfovzlkhkmg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_ANON_KEY) {
  console.error('❌ SUPABASE_ANON_KEY no configurada');
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// Funciones de lectura (tablas existentes)
// ============================================

/** Buscar productos por nombre, marca o código */
export async function buscarProductos(query: string, limit = 10) {
  const searchTerm = `%${query}%`;
  const { data, error } = await supabase
    .from('articulos')
    .select('codigo, nombre, marca, grupo, costo, pct_iva, precio_neto_mayorista, precio_neto_minorista, precio_mayorista, precio_minorista')
    .or(`nombre.ilike.${searchTerm},codigo.ilike.${searchTerm},marca.ilike.${searchTerm}`)
    .limit(limit);

  if (error) console.error('Error buscando productos:', error);
  return data || [];
}

/** Consultar stock de un producto por código */
export async function consultarStock(codigo: string) {
  const { data, error } = await supabase
    .from('stock')
    .select('codigo, nombre, stock_operativo, stock_local, stock_sprinter, stock_total')
    .eq('codigo', codigo)
    .single();

  if (error && error.code !== 'PGRST116') console.error('Error consultando stock:', error);
  return data;
}

/** Verificar si un teléfono ya es cliente existente */
export async function buscarClientePorTelefono(telefono: string) {
  // Normalizar teléfono: quitar +, espacios, guiones
  const telNorm = telefono.replace(/[\s\-\+]/g, '');
  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, codigo, telefono, etapa_crm, vendedor, zona')
    .or(`telefono.ilike.%${telNorm.slice(-8)}%`)
    .limit(1);

  if (error) console.error('Error buscando cliente:', error);
  return data && data.length > 0 ? data[0] : null;
}

// ============================================
// Funciones de escritura (tablas sa_*)
// ============================================

/** Crear un nuevo prospecto */
export async function crearProspecto(prospecto: {
  nombre_negocio: string;
  tipo_negocio: string;
  telefono: string;
  ciudad?: string;
  departamento?: string;
  provincia?: string;
  direccion?: string;
  instagram?: string;
  facebook?: string;
  google_maps_url?: string;
  fuente: string;
  notas?: string;
}) {
  const { data, error } = await supabase
    .from('sa_prospectos')
    .insert(prospecto)
    .select()
    .single();

  if (error) console.error('Error creando prospecto:', error);
  return data;
}

/** Buscar prospecto por teléfono */
export async function buscarProspectoPorTelefono(telefono: string) {
  const telNorm = telefono.replace(/[\s\-\+]/g, '');
  const { data, error } = await supabase
    .from('sa_prospectos')
    .select('*')
    .or(`telefono.ilike.%${telNorm.slice(-8)}%`)
    .limit(1);

  if (error) console.error('Error buscando prospecto:', error);
  return data && data.length > 0 ? data[0] : null;
}

/** Registrar un mensaje */
export async function registrarMensaje(mensaje: {
  prospecto_id: number;
  direccion: 'entrante' | 'saliente';
  contenido: string;
  tipo: string;
  estado?: string;
}) {
  const { data, error } = await supabase
    .from('sa_mensajes')
    .insert(mensaje)
    .select()
    .single();

  if (error) console.error('Error registrando mensaje:', error);
  return data;
}

/** Actualizar score de un prospecto */
export async function actualizarScore(prospectoId: number, score: number, categoria: string) {
  const { error } = await supabase
    .from('sa_prospectos')
    .update({ score, categoria_score: categoria, updated_at: new Date().toISOString() })
    .eq('id', prospectoId);

  if (error) console.error('Error actualizando score:', error);
}

/** Registrar señal de scoring */
export async function registrarSenal(prospectoId: number, senal: string, puntos: number, detalle?: string) {
  const { error } = await supabase
    .from('sa_scoring_log')
    .insert({ prospecto_id: prospectoId, senal, puntos, detalle });

  if (error) console.error('Error registrando señal:', error);
}

/** Actualizar etapa de un prospecto */
export async function actualizarEtapa(prospectoId: number, etapa: string) {
  const updates: Record<string, any> = { etapa, updated_at: new Date().toISOString() };

  if (etapa === 'contactado') updates.fecha_contacto = new Date().toISOString();
  if (etapa === 'respondio') updates.fecha_respuesta = new Date().toISOString();

  const { error } = await supabase
    .from('sa_prospectos')
    .update(updates)
    .eq('id', prospectoId);

  if (error) console.error('Error actualizando etapa:', error);
}

/** Obtener configuración del Sales Agent */
export async function getConfig(clave: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sa_config')
    .select('valor')
    .eq('clave', clave)
    .single();

  if (error) return null;
  return data?.valor || null;
}

/** Obtener toda la configuración */
export async function getAllConfig(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('sa_config')
    .select('clave, valor');

  if (error) return {};
  const config: Record<string, string> = {};
  (data || []).forEach((row: any) => { config[row.clave] = row.valor; });
  return config;
}

console.log('✅ Supabase conectado:', SUPABASE_URL);
