/**
 * Web Scraper — Busca negocios en directorios online y buscadores
 *
 * Fuentes:
 * - Páginas Amarillas Argentina
 * - Guía de comercios locales
 * - Resultados de búsqueda web
 *
 * No requiere API key. Usa scraping respetuoso con delays.
 */

import { NegocioEncontrado, ZonaBusqueda, ResultadoBusqueda, KEYWORDS_BUSQUEDA } from '../types';

/** User agent para no ser bloqueado */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Headers comunes */
const HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

/** Busca en Páginas Amarillas Argentina */
export async function buscarEnPaginasAmarillas(
  zona: ZonaBusqueda,
  tipoNegocio: string
): Promise<ResultadoBusqueda> {
  const keywords = KEYWORDS_BUSQUEDA[tipoNegocio] || [tipoNegocio];
  const negocios: NegocioEncontrado[] = [];
  const errores: string[] = [];

  for (const keyword of keywords.slice(0, 2)) {
    try {
      // Páginas Amarillas Argentina URL
      const query = encodeURIComponent(keyword);
      const location = encodeURIComponent(`${zona.ciudad}, ${zona.provincia}`);
      const url = `https://www.paginasamarillas.com.ar/buscar/q/${query}/l/${location}`;

      const response = await fetch(url, { headers: HEADERS });

      if (!response.ok) {
        errores.push(`Páginas Amarillas respondió ${response.status} para "${keyword}" en ${zona.ciudad}`);
        continue;
      }

      const html = await response.text();
      const encontrados = parsearPaginasAmarillas(html, tipoNegocio, zona, keyword);
      negocios.push(...encontrados);

      // Delay entre requests para ser respetuosos
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error: any) {
      errores.push(`Error en Páginas Amarillas: ${error.message}`);
    }
  }

  return {
    fuente: 'paginas_amarillas',
    query: tipoNegocio,
    zona: zona.ciudad,
    negocios: deduplicar(negocios),
    total_encontrados: negocios.length,
    errores: errores.length > 0 ? errores : undefined,
    timestamp: new Date().toISOString()
  };
}

/** Parsea HTML de Páginas Amarillas */
function parsearPaginasAmarillas(
  html: string,
  tipoNegocio: string,
  zona: ZonaBusqueda,
  keyword: string
): NegocioEncontrado[] {
  const negocios: NegocioEncontrado[] = [];

  // Extraer datos con regex (sin depender de cheerio por ahora)
  // Páginas Amarillas tiene una estructura con cards de negocios

  // Patrón para nombres de negocio
  const nombrePattern = /<h2[^>]*class="[^"]*card-title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
  const telefonoPattern = /(?:tel|phone)[^>]*>([+\d\s\-()]+)</gi;
  const direccionPattern = /<span[^>]*class="[^"]*address[^"]*"[^>]*>([^<]+)<\/span>/gi;

  let match;
  const nombres: string[] = [];
  const telefonos: string[] = [];
  const direcciones: string[] = [];

  while ((match = nombrePattern.exec(html)) !== null) {
    nombres.push(match[1].trim());
  }

  while ((match = telefonoPattern.exec(html)) !== null) {
    telefonos.push(match[1].trim().replace(/[\s\-\(\)]/g, ''));
  }

  while ((match = direccionPattern.exec(html)) !== null) {
    direcciones.push(match[1].trim());
  }

  // Combinar los datos encontrados
  for (let i = 0; i < nombres.length; i++) {
    negocios.push({
      nombre: nombres[i],
      tipo_negocio: tipoNegocio as any,
      telefono: telefonos[i] || undefined,
      direccion: direcciones[i] || undefined,
      ciudad: zona.ciudad,
      provincia: zona.provincia,
      departamento: zona.departamento,
      fuente: 'paginas_amarillas',
      verificado: false,
      notas: `Encontrado en Páginas Amarillas buscando "${keyword}"`
    });
  }

  return negocios;
}

/** Busca negocios usando búsqueda web genérica (DuckDuckGo) */
export async function buscarEnWeb(
  zona: ZonaBusqueda,
  tipoNegocio: string
): Promise<ResultadoBusqueda> {
  const keywords = KEYWORDS_BUSQUEDA[tipoNegocio] || [tipoNegocio];
  const negocios: NegocioEncontrado[] = [];
  const errores: string[] = [];

  for (const keyword of keywords.slice(0, 2)) {
    try {
      const query = `${keyword} ${zona.ciudad} ${zona.provincia} telefono`;
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

      const response = await fetch(url, { headers: HEADERS });

      if (!response.ok) {
        errores.push(`DuckDuckGo respondió ${response.status}`);
        continue;
      }

      const html = await response.text();
      const encontrados = parsearResultadosWeb(html, tipoNegocio, zona, keyword);
      negocios.push(...encontrados);

      // Delay entre requests
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error: any) {
      errores.push(`Error en búsqueda web: ${error.message}`);
    }
  }

  return {
    fuente: 'web_search',
    query: tipoNegocio,
    zona: zona.ciudad,
    negocios: deduplicar(negocios),
    total_encontrados: negocios.length,
    errores: errores.length > 0 ? errores : undefined,
    timestamp: new Date().toISOString()
  };
}

/** Parsea resultados de búsqueda web para extraer negocios */
function parsearResultadosWeb(
  html: string,
  tipoNegocio: string,
  zona: ZonaBusqueda,
  keyword: string
): NegocioEncontrado[] {
  const negocios: NegocioEncontrado[] = [];

  // Extraer snippets de resultados de búsqueda
  const resultPattern = /<a[^>]*class="result__a"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = resultPattern.exec(html)) !== null) {
    const titulo = match[1].trim();
    const snippet = match[2].replace(/<[^>]+>/g, '').trim();

    // Extraer teléfono del snippet si hay
    const telMatch = snippet.match(/(?:\+54|0\d{2,4})\s*[\d\s\-]{6,12}/);
    const telefono = telMatch ? telMatch[0].replace(/[\s\-]/g, '') : undefined;

    // Solo agregar si parece un negocio relevante
    const esRelevante = keywords_match(titulo + ' ' + snippet, tipoNegocio);
    if (esRelevante) {
      negocios.push({
        nombre: titulo.substring(0, 100),
        tipo_negocio: tipoNegocio as any,
        telefono,
        ciudad: zona.ciudad,
        provincia: zona.provincia,
        departamento: zona.departamento,
        fuente: 'web_search',
        verificado: false,
        notas: `Encontrado en búsqueda web: "${keyword}". Snippet: ${snippet.substring(0, 150)}`
      });
    }
  }

  return negocios;
}

/** Verifica si un texto matchea con el tipo de negocio */
function keywords_match(texto: string, tipoNegocio: string): boolean {
  const lower = texto.toLowerCase();
  const keywords = KEYWORDS_BUSQUEDA[tipoNegocio] || [];
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

/** Elimina duplicados */
function deduplicar(negocios: NegocioEncontrado[]): NegocioEncontrado[] {
  const vistos = new Set<string>();
  return negocios.filter(n => {
    const clave = n.telefono
      ? `tel:${n.telefono.slice(-8)}`
      : `nom:${n.nombre.toLowerCase().substring(0, 30)}`;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

console.log('✅ Fuente Web Scraper cargada');
