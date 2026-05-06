/**
 * Claude Enricher — Usa IA para enriquecer y verificar prospectos
 *
 * Dado un negocio encontrado con data parcial, Claude:
 * - Clasifica el tipo de negocio con más precisión
 * - Sugiere si vale la pena contactar
 * - Genera notas útiles para el vendedor
 */

import { NegocioEncontrado } from '../types';

const CLAUDE_PROXY_URL = process.env.CLAUDE_PROXY_URL
  || 'https://xsnztltwekfovzlkhkmg.supabase.co/functions/v1/informe-proxy';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

interface EnrichmentResult {
  tipo_negocio_corregido: string;
  score_relevancia: number;        // 0-100, qué tan buen prospecto parece
  vale_la_pena: boolean;           // Si vale contactar
  razon: string;                   // Por qué sí o no
  notas_vendedor: string;          // Tips para el vendedor
  posibles_productos: string[];    // Qué productos podría comprar
}

/** Enriquece un batch de negocios con Claude */
export async function enriquecerConClaude(
  negocios: NegocioEncontrado[]
): Promise<Map<string, EnrichmentResult>> {
  const resultados = new Map<string, EnrichmentResult>();

  // Procesar en batches de 10 para no sobrecargar el proxy
  const batchSize = 10;
  for (let i = 0; i < negocios.length; i += batchSize) {
    const batch = negocios.slice(i, i + batchSize);

    try {
      const resultado = await analizarBatch(batch);
      resultado.forEach((value, key) => resultados.set(key, value));
    } catch (error) {
      console.error(`Error enriqueciendo batch ${i / batchSize + 1}:`, error);
    }

    // Delay entre batches
    if (i + batchSize < negocios.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return resultados;
}

/** Analiza un batch de negocios con Claude */
async function analizarBatch(
  negocios: NegocioEncontrado[]
): Promise<Map<string, EnrichmentResult>> {
  const listado = negocios.map((n, i) => {
    return `${i + 1}. "${n.nombre}" - ${n.tipo_negocio} - ${n.ciudad || 'ciudad desconocida'} - Tel: ${n.telefono || 'sin teléfono'} - Rating: ${n.rating || 'N/A'} (${n.cantidad_reviews || 0} reviews) - ${n.notas || ''}`;
  }).join('\n');

  const prompt = `Sos un analista comercial de Veicolo Accesorios, empresa mayorista de repuestos y accesorios de motos en Córdoba, Argentina. Necesito que analices estos negocios encontrados para determinar si son buenos prospectos para venderles al por mayor.

NEGOCIOS ENCONTRADOS:
${listado}

NUESTROS PRODUCTOS: Repuestos de motos, cubiertas, cámaras, aceites, filtros, cadenas, pastillas de freno, cascos, accesorios.

CLIENTES IDEALES: Gomerías que trabajan con motos, talleres de motos, lubricentros, casas de repuestos de motos.

Para cada negocio, respondé SOLO con un JSON array válido (sin markdown, sin backticks):
[
  {
    "indice": 1,
    "tipo_negocio_corregido": "gomeria|taller_motos|lubricentro|repuestos_motos|otro",
    "score_relevancia": 0-100,
    "vale_la_pena": true/false,
    "razon": "explicación corta",
    "notas_vendedor": "tip útil para el primer contacto",
    "posibles_productos": ["producto1", "producto2"]
  }
]

Criterios:
- Gomerías y talleres de motos son los mejores prospectos (70-100)
- Lubricentros y casas de repuestos también sirven (50-80)
- Negocios de autos sin motos son menos relevantes (20-40)
- Sin teléfono baja el score (no lo podemos contactar por WhatsApp)
- Muchas reviews = negocio activo = mejor prospecto
- Rating alto = negocio serio = mejor prospecto`;

  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: 'Sos un analista de datos comerciales. Respondés SOLO en JSON válido, sin explicaciones adicionales.',
    messages: [{ role: 'user', content: prompt }]
  };

  const response = await fetch(CLAUDE_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Claude proxy error: ${response.status}`);
  }

  const data: any = await response.json();
  let text = '';

  if (data.content && Array.isArray(data.content)) {
    const textBlock = data.content.find((block: any) => block.type === 'text');
    text = textBlock?.text || '';
  } else if (data.response) {
    text = data.response;
  } else {
    text = JSON.stringify(data);
  }

  // Limpiar y parsear
  const jsonLimpio = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  const analisis: any[] = JSON.parse(jsonLimpio);

  const resultados = new Map<string, EnrichmentResult>();

  for (const item of analisis) {
    const idx = item.indice - 1;
    if (idx >= 0 && idx < negocios.length) {
      const clave = negocios[idx].nombre + '|' + (negocios[idx].telefono || '');
      resultados.set(clave, {
        tipo_negocio_corregido: item.tipo_negocio_corregido,
        score_relevancia: item.score_relevancia,
        vale_la_pena: item.vale_la_pena,
        razon: item.razon,
        notas_vendedor: item.notas_vendedor,
        posibles_productos: item.posibles_productos || []
      });
    }
  }

  return resultados;
}

console.log('✅ Claude Enricher cargado');
