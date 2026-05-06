/**
 * Lead Scoring Calculator
 *
 * Calcula el puntaje de cada prospecto basado en señales
 * y determina su categoría (frío/tibio/caliente/ardiendo)
 */

import { actualizarScore, registrarSenal, getAllConfig } from '../integrations/supabase';

/** Señales y sus puntos */
const SENALES: Record<string, number> = {
  'respondio_primer_mensaje': 20,
  'pregunto_productos': 15,
  'pregunto_precio_cantidad': 25,
  'pidio_oferta': 30,
  'negocio_verificado': 10,
  'tipo_gomeria': 10,
  'tipo_taller': 7,
  'tipo_otro': 5,
  'zona_ciudad_grande': 5,
  'zona_pueblo': 3,
  'no_respondio_primer_mensaje': -5,
  'no_respondio_segundo_mensaje': -20,
};

/** Calcula la categoría basada en el score */
function calcularCategoria(score: number, config: Record<string, string>): string {
  const frioMax = parseInt(config.score_frio_max || '25');
  const tibioMax = parseInt(config.score_tibio_max || '50');
  const calienteMax = parseInt(config.score_caliente_max || '75');

  if (score <= frioMax) return 'frio';
  if (score <= tibioMax) return 'tibio';
  if (score <= calienteMax) return 'caliente';
  return 'ardiendo';
}

/** Agrega una señal y recalcula el score de un prospecto */
export async function agregarSenal(
  prospectoId: number,
  senal: string,
  scoreActual: number,
  detalle?: string
): Promise<{ nuevoScore: number; categoria: string }> {
  const puntos = SENALES[senal];
  if (puntos === undefined) {
    console.warn(`⚠️ Señal desconocida: ${senal}`);
    return { nuevoScore: scoreActual, categoria: 'frio' };
  }

  // Registrar la señal
  await registrarSenal(prospectoId, senal, puntos, detalle);

  // Calcular nuevo score (mínimo 0, máximo 100)
  const nuevoScore = Math.max(0, Math.min(100, scoreActual + puntos));

  // Obtener config para umbrales
  const config = await getAllConfig();
  const categoria = calcularCategoria(nuevoScore, config);

  // Actualizar en base de datos
  await actualizarScore(prospectoId, nuevoScore, categoria);

  console.log(`📊 Score de prospecto #${prospectoId}: ${scoreActual} → ${nuevoScore} (${categoria})`);

  return { nuevoScore, categoria };
}

/** Calcula el score inicial de un prospecto nuevo */
export async function scoreInicial(
  prospectoId: number,
  tipoNegocio: string,
  verificado: boolean,
  ciudad: string
): Promise<{ score: number; categoria: string }> {
  let score = 0;

  // Tipo de negocio
  if (tipoNegocio === 'gomeria') {
    await registrarSenal(prospectoId, 'tipo_gomeria', SENALES.tipo_gomeria, 'Clasificado como gomería');
    score += SENALES.tipo_gomeria;
  } else if (tipoNegocio === 'taller_motos') {
    await registrarSenal(prospectoId, 'tipo_taller', SENALES.tipo_taller, 'Clasificado como taller');
    score += SENALES.tipo_taller;
  } else {
    await registrarSenal(prospectoId, 'tipo_otro', SENALES.tipo_otro, `Tipo: ${tipoNegocio}`);
    score += SENALES.tipo_otro;
  }

  // Verificación
  if (verificado) {
    await registrarSenal(prospectoId, 'negocio_verificado', SENALES.negocio_verificado, 'Google Maps / Instagram');
    score += SENALES.negocio_verificado;
  }

  // Zona (ciudades grandes de Córdoba)
  const ciudadesGrandes = ['córdoba', 'cordoba', 'río cuarto', 'rio cuarto', 'villa maría', 'villa maria',
    'san francisco', 'carlos paz', 'villa carlos paz', 'jesús maría', 'jesus maria', 'alta gracia'];
  const esCiudadGrande = ciudadesGrandes.some(c => ciudad.toLowerCase().includes(c));

  if (esCiudadGrande) {
    await registrarSenal(prospectoId, 'zona_ciudad_grande', SENALES.zona_ciudad_grande, ciudad);
    score += SENALES.zona_ciudad_grande;
  } else if (ciudad) {
    await registrarSenal(prospectoId, 'zona_pueblo', SENALES.zona_pueblo, ciudad);
    score += SENALES.zona_pueblo;
  }

  // Calcular categoría
  const config = await getAllConfig();
  const categoria = calcularCategoria(score, config);

  // Guardar
  await actualizarScore(prospectoId, score, categoria);

  console.log(`📊 Score inicial de prospecto #${prospectoId}: ${score} (${categoria})`);

  return { score, categoria };
}

console.log('✅ Scoring calculator cargado');
