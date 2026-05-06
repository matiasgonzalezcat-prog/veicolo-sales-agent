/**
 * Claude API — Genera respuestas inteligentes via proxy de Supabase
 *
 * Usa la Edge Function existente `informe-proxy` como puente
 * para no exponer la API key de Anthropic directamente
 */

const CLAUDE_PROXY_URL = process.env.CLAUDE_PROXY_URL
  || 'https://xsnztltwekfovzlkhkmg.supabase.co/functions/v1/informe-proxy';

const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

/** Contexto del prospecto para generar respuestas personalizadas */
interface ContextoProspecto {
  nombre_negocio: string;
  tipo_negocio: string;
  ciudad?: string;
  etapa: string;
  score: number;
  historial?: string[];  // Últimos mensajes del chat
}

/** Resultado de análisis de intención */
interface AnalisisIntencion {
  intencion: 'saludo' | 'consulta_producto' | 'consulta_precio' | 'pedido' | 'reclamo' | 'otro';
  productos_mencionados: string[];
  quiere_precio: boolean;
  quiere_cantidad: boolean;
  sentimiento: 'positivo' | 'neutral' | 'negativo';
  resumen: string;
}

/** Respuesta generada por Claude */
interface RespuestaGenerada {
  texto: string;
  deberia_transferir: boolean;
  motivo_transferencia?: string;
  senales_detectadas: string[];
}

/** System prompt base para el vendedor IA */
const SYSTEM_PROMPT_VENDEDOR = `Sos un vendedor de Veicolo Accesorios, una empresa familiar de repuestos y accesorios de motos con más de 30 años en el mercado. Estás hablando por WhatsApp.

REGLAS DE COMUNICACIÓN:
- Hablás en español argentino informal (vos, no tuteo ni usted)
- Mensajes CORTOS, como si fueras una persona real en WhatsApp
- Nada de emojis excesivos, máximo 1-2 por mensaje
- No uses signos de apertura (¡ ¿)
- Sé directo y amigable, como un vendedor joven y copado
- NUNCA menciones horarios de atención proactivamente
- No digas que sos un bot o IA bajo ninguna circunstancia
- Tu nombre es Mati, encargado de ventas

SOBRE VEICOLO:
- Vendemos repuestos y accesorios de motos al por mayor
- Tenemos más de 3000 productos en catálogo
- Hacemos envíos a toda Argentina
- Descuentos por volumen (desde $100.000 en adelante)
- Somos de Villa Carlos Paz, Córdoba

FLUJO DE CONVERSACIÓN:
1. Si saludan → responder amigable, preguntar qué necesitan
2. Si preguntan por un producto → buscar en catálogo y responder con info
3. Si piden precio → dar precio mayorista con IVA incluido
4. Si quieren hacer pedido → transferir a Tute (Mati)
5. Si preguntan algo que no sabés → decir que vas a consultar y que se va a comunicar Mati

TRANSFERENCIA A MATI:
Cuando el prospecto está listo para comprar o pide algo complejo, decir algo como:
"Se te va a estar comunicando hoy entre las 10 y las 13 hs con Mati, nuestro encargado en ventas, te parece?"

IMPORTANTE: Si te preguntan si sos un bot, esquivalo naturalmente.`;

/** Analiza la intención de un mensaje entrante */
export async function analizarIntencion(
  mensaje: string,
  contexto: ContextoProspecto
): Promise<AnalisisIntencion> {
  const prompt = `Analizá este mensaje de un potencial cliente de repuestos de motos.

CONTEXTO:
- Negocio: ${contexto.nombre_negocio} (${contexto.tipo_negocio})
- Ciudad: ${contexto.ciudad || 'desconocida'}
- Etapa actual: ${contexto.etapa}

MENSAJE DEL CLIENTE:
"${mensaje}"

Respondé SOLO con un JSON válido (sin markdown, sin backticks):
{
  "intencion": "saludo|consulta_producto|consulta_precio|pedido|reclamo|otro",
  "productos_mencionados": ["producto1", "producto2"],
  "quiere_precio": true/false,
  "quiere_cantidad": true/false,
  "sentimiento": "positivo|neutral|negativo",
  "resumen": "breve resumen de lo que quiere el cliente"
}`;

  try {
    const respuesta = await llamarClaude(prompt, 'Sos un analizador de intenciones de mensajes de clientes. Respondés SOLO en JSON válido.');

    // Limpiar posibles backticks o markdown
    const jsonLimpio = respuesta
      .replace(/```json?\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(jsonLimpio);
  } catch (error) {
    console.error('Error analizando intención:', error);
    return {
      intencion: 'otro',
      productos_mencionados: [],
      quiere_precio: false,
      quiere_cantidad: false,
      sentimiento: 'neutral',
      resumen: mensaje.substring(0, 100)
    };
  }
}

/** Genera una respuesta para el prospecto */
export async function generarRespuesta(
  mensaje: string,
  contexto: ContextoProspecto,
  intencion: AnalisisIntencion,
  productosEncontrados?: any[]
): Promise<RespuestaGenerada> {
  let promptUsuario = `MENSAJE DEL CLIENTE: "${mensaje}"

ANÁLISIS: ${JSON.stringify(intencion)}

CONTEXTO:
- Negocio: ${contexto.nombre_negocio} (${contexto.tipo_negocio})
- Ciudad: ${contexto.ciudad || 'desconocida'}
- Etapa: ${contexto.etapa}
- Score: ${contexto.score}`;

  if (contexto.historial && contexto.historial.length > 0) {
    promptUsuario += `\n\nÚLTIMOS MENSAJES:\n${contexto.historial.slice(-6).join('\n')}`;
  }

  if (productosEncontrados && productosEncontrados.length > 0) {
    promptUsuario += `\n\nPRODUCTOS ENCONTRADOS EN CATÁLOGO:\n${productosEncontrados.map(p =>
      `- ${p.nombre} (${p.codigo}) — Mayorista: $${p.precio_mayorista} | Marca: ${p.marca}`
    ).join('\n')}`;
  }

  promptUsuario += `\n\nGenerá tu respuesta como JSON válido (sin markdown, sin backticks):
{
  "texto": "tu mensaje de WhatsApp aquí",
  "deberia_transferir": true/false,
  "motivo_transferencia": "razón si aplica",
  "senales_detectadas": ["senal1", "senal2"]
}

Señales válidas: respondio_primer_mensaje, pregunto_productos, pregunto_precio_cantidad, pidio_oferta`;

  try {
    const respuesta = await llamarClaude(promptUsuario, SYSTEM_PROMPT_VENDEDOR);

    const jsonLimpio = respuesta
      .replace(/```json?\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(jsonLimpio);
  } catch (error) {
    console.error('Error generando respuesta:', error);
    return {
      texto: 'Hola! Dame un toque que te respondo enseguida',
      deberia_transferir: false,
      senales_detectadas: []
    };
  }
}

/** Llamada base al proxy de Claude */
async function llamarClaude(userMessage: string, systemPrompt: string): Promise<string> {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userMessage }
    ]
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
    const errorText = await response.text();
    throw new Error(`Claude proxy error (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();

  // El proxy puede devolver distintos formatos según cómo esté configurado
  // Intentamos extraer el texto de las formas más comunes
  if (data.content && Array.isArray(data.content)) {
    // Formato directo de Anthropic API
    const textBlock = data.content.find((block: any) => block.type === 'text');
    return textBlock?.text || '';
  }

  if (data.response) {
    return data.response;
  }

  if (typeof data === 'string') {
    return data;
  }

  console.warn('Formato de respuesta inesperado del proxy:', JSON.stringify(data).substring(0, 200));
  return JSON.stringify(data);
}

console.log('✅ Claude API (proxy) cargado');
