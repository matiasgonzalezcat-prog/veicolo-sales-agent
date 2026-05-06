/**
 * Prospector — Orquestador principal
 *
 * Coordina las búsquedas en distintas fuentes, deduplica,
 * enriquece con Claude, y guarda en Supabase.
 *
 * Uso:
 *   npx ts-node src/prospector/index.ts [--zona "Córdoba Capital"] [--tipo gomeria]
 */

import dotenv from 'dotenv';
dotenv.config();

import { NegocioEncontrado, ZonaBusqueda, ZONAS_CORDOBA, KEYWORDS_BUSQUEDA } from './types';
import { buscarEnGoogleMaps } from './sources/google-maps';
import { buscarEnPaginasAmarillas, buscarEnWeb } from './sources/web-scraper';
import { enriquecerConClaude } from './sources/claude-enricher';
import {
  crearProspecto,
  buscarProspectoPorTelefono,
  supabase
} from '../integrations/supabase';
import { scoreInicial } from '../scoring/calculator';

/** Resultado de una corrida del prospector */
interface ProspectorResult {
  zona: string;
  tipo: string;
  encontrados: number;
  nuevos: number;
  duplicados: number;
  sin_telefono: number;
  guardados: number;
  errores: string[];
  duracion_seg: number;
}

/** Corre el prospector para una zona y tipo de negocio */
export async function prospectar(
  zona: ZonaBusqueda,
  tipoNegocio: string,
  opciones: {
    usarGoogleMaps?: boolean;
    usarPaginasAmarillas?: boolean;
    usarWeb?: boolean;
    enriquecerConIA?: boolean;
    guardarEnDB?: boolean;
  } = {}
): Promise<ProspectorResult> {
  const inicio = Date.now();
  const opts = {
    usarGoogleMaps: true,
    usarPaginasAmarillas: true,
    usarWeb: true,
    enriquecerConIA: true,
    guardarEnDB: true,
    ...opciones
  };

  console.log(`\n🔍 Prospectando ${tipoNegocio} en ${zona.ciudad}...`);

  const todosNegocios: NegocioEncontrado[] = [];
  const errores: string[] = [];

  // 1. Buscar en todas las fuentes
  const busquedas: Promise<void>[] = [];

  if (opts.usarGoogleMaps) {
    busquedas.push(
      buscarEnGoogleMaps(zona, tipoNegocio).then(r => {
        console.log(`  📍 Google Maps: ${r.total_encontrados} encontrados`);
        todosNegocios.push(...r.negocios);
        if (r.errores) errores.push(...r.errores);
      }).catch(e => { errores.push(`Google Maps: ${e.message}`); })
    );
  }

  if (opts.usarPaginasAmarillas) {
    busquedas.push(
      buscarEnPaginasAmarillas(zona, tipoNegocio).then(r => {
        console.log(`  📒 Páginas Amarillas: ${r.total_encontrados} encontrados`);
        todosNegocios.push(...r.negocios);
        if (r.errores) errores.push(...r.errores);
      }).catch(e => { errores.push(`Páginas Amarillas: ${e.message}`); })
    );
  }

  if (opts.usarWeb) {
    busquedas.push(
      buscarEnWeb(zona, tipoNegocio).then(r => {
        console.log(`  🌐 Web: ${r.total_encontrados} encontrados`);
        todosNegocios.push(...r.negocios);
        if (r.errores) errores.push(...r.errores);
      }).catch(e => { errores.push(`Web: ${e.message}`); })
    );
  }

  await Promise.all(busquedas);
  console.log(`  📊 Total bruto: ${todosNegocios.length} negocios`);

  // 2. Deduplicar globalmente
  const unicos = deduplicarGlobal(todosNegocios);
  const duplicados = todosNegocios.length - unicos.length;
  console.log(`  🔄 Después de dedup: ${unicos.length} únicos (${duplicados} duplicados)`);

  // 3. Separar los que tienen teléfono (contactables) de los que no
  const conTelefono = unicos.filter(n => n.telefono && n.telefono.length >= 8);
  const sinTelefono = unicos.length - conTelefono.length;
  console.log(`  📱 Con teléfono: ${conTelefono.length} | Sin teléfono: ${sinTelefono}`);

  // 4. Enriquecer con Claude si hay negocios
  if (opts.enriquecerConIA && conTelefono.length > 0) {
    try {
      console.log(`  🧠 Enriqueciendo ${conTelefono.length} negocios con Claude...`);
      const enrichment = await enriquecerConClaude(conTelefono);

      // Aplicar enrichment
      for (const negocio of conTelefono) {
        const clave = negocio.nombre + '|' + (negocio.telefono || '');
        const enrich = enrichment.get(clave);
        if (enrich) {
          negocio.tipo_negocio = enrich.tipo_negocio_corregido as any;
          negocio.notas = `${negocio.notas || ''}\n🧠 IA: ${enrich.razon}\n💡 Tip: ${enrich.notas_vendedor}\n📦 Productos: ${enrich.posibles_productos.join(', ')}`;
        }
      }
      console.log(`  ✅ Enrichment completado`);
    } catch (error: any) {
      errores.push(`Claude enrichment: ${error.message}`);
      console.error(`  ⚠️ Error en enrichment:`, error.message);
    }
  }

  // 5. Guardar en Supabase
  let guardados = 0;
  let yaExistentes = 0;

  if (opts.guardarEnDB) {
    console.log(`  💾 Guardando en Supabase...`);
    for (const negocio of conTelefono) {
      try {
        // Verificar si ya existe
        const existe = await buscarProspectoPorTelefono(negocio.telefono!);
        if (existe) {
          yaExistentes++;
          continue;
        }

        // Verificar si ya es cliente existente
        const { data: clienteExistente } = await supabase
          .from('clientes')
          .select('id, nombre')
          .or(`telefono.ilike.%${negocio.telefono!.slice(-8)}%`)
          .limit(1);

        if (clienteExistente && clienteExistente.length > 0) {
          yaExistentes++;
          console.log(`  ⏭️ ${negocio.nombre} ya es cliente: ${clienteExistente[0].nombre}`);
          continue;
        }

        // Crear prospecto
        const prospecto = await crearProspecto({
          nombre_negocio: negocio.nombre,
          tipo_negocio: negocio.tipo_negocio,
          telefono: negocio.telefono!,
          ciudad: negocio.ciudad,
          departamento: negocio.departamento,
          provincia: negocio.provincia,
          direccion: negocio.direccion,
          instagram: negocio.instagram,
          facebook: negocio.facebook,
          google_maps_url: negocio.google_maps_url,
          fuente: negocio.fuente,
          notas: negocio.notas
        });

        if (prospecto) {
          // Calcular score inicial
          await scoreInicial(
            prospecto.id,
            negocio.tipo_negocio,
            negocio.verificado,
            negocio.ciudad || ''
          );
          guardados++;
        }
      } catch (error: any) {
        errores.push(`Error guardando ${negocio.nombre}: ${error.message}`);
      }
    }
    console.log(`  ✅ Guardados: ${guardados} nuevos | ${yaExistentes} ya existentes`);
  }

  const duracion = Math.round((Date.now() - inicio) / 1000);
  console.log(`  ⏱️ Duración: ${duracion}s`);

  return {
    zona: zona.ciudad,
    tipo: tipoNegocio,
    encontrados: todosNegocios.length,
    nuevos: guardados,
    duplicados,
    sin_telefono: sinTelefono,
    guardados,
    errores,
    duracion_seg: duracion
  };
}

/** Corre el prospector para todas las zonas y tipos */
export async function prospectarTodo(
  opciones?: {
    zonas?: ZonaBusqueda[];
    tipos?: string[];
    usarGoogleMaps?: boolean;
    usarPaginasAmarillas?: boolean;
    usarWeb?: boolean;
    enriquecerConIA?: boolean;
    guardarEnDB?: boolean;
  }
): Promise<ProspectorResult[]> {
  const zonas = opciones?.zonas || ZONAS_CORDOBA;
  const tipos = opciones?.tipos || Object.keys(KEYWORDS_BUSQUEDA);
  const resultados: ProspectorResult[] = [];

  console.log(`\n🚀 PROSPECTOR INICIADO`);
  console.log(`   Zonas: ${zonas.length} | Tipos: ${tipos.join(', ')}`);
  console.log(`   Total de búsquedas: ${zonas.length * tipos.length}\n`);

  for (const zona of zonas) {
    for (const tipo of tipos) {
      const resultado = await prospectar(zona, tipo, opciones);
      resultados.push(resultado);

      // Delay entre zonas para no sobrecargar las fuentes
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Resumen final
  const totalEncontrados = resultados.reduce((sum, r) => sum + r.encontrados, 0);
  const totalNuevos = resultados.reduce((sum, r) => sum + r.nuevos, 0);
  const totalErrores = resultados.reduce((sum, r) => sum + r.errores.length, 0);

  console.log(`\n📊 RESUMEN PROSPECTOR`);
  console.log(`   Total encontrados: ${totalEncontrados}`);
  console.log(`   Nuevos guardados: ${totalNuevos}`);
  console.log(`   Errores: ${totalErrores}`);
  console.log(`   Zonas cubiertas: ${zonas.length}`);

  return resultados;
}

/** Deduplicación global entre todas las fuentes */
function deduplicarGlobal(negocios: NegocioEncontrado[]): NegocioEncontrado[] {
  const vistos = new Map<string, NegocioEncontrado>();

  for (const negocio of negocios) {
    const clave = negocio.telefono
      ? `tel:${negocio.telefono.slice(-8)}`
      : `nom:${negocio.nombre.toLowerCase().replace(/\s+/g, '').substring(0, 25)}-${negocio.ciudad?.toLowerCase() || ''}`;

    const existente = vistos.get(clave);

    if (!existente) {
      vistos.set(clave, negocio);
    } else {
      // Mergear: quedarse con el que tiene más data
      vistos.set(clave, mergearNegocios(existente, negocio));
    }
  }

  return Array.from(vistos.values());
}

/** Mergea dos negocios, quedándose con la data más completa */
function mergearNegocios(a: NegocioEncontrado, b: NegocioEncontrado): NegocioEncontrado {
  return {
    nombre: a.nombre.length >= b.nombre.length ? a.nombre : b.nombre,
    tipo_negocio: a.tipo_negocio,
    telefono: a.telefono || b.telefono,
    direccion: a.direccion || b.direccion,
    ciudad: a.ciudad || b.ciudad,
    departamento: a.departamento || b.departamento,
    provincia: a.provincia || b.provincia,
    instagram: a.instagram || b.instagram,
    facebook: a.facebook || b.facebook,
    google_maps_url: a.google_maps_url || b.google_maps_url,
    website: a.website || b.website,
    rating: a.rating || b.rating,
    cantidad_reviews: Math.max(a.cantidad_reviews || 0, b.cantidad_reviews || 0),
    horarios: a.horarios || b.horarios,
    fuente: a.verificado ? a.fuente : b.fuente, // Preferir la fuente verificada
    fuente_url: a.fuente_url || b.fuente_url,
    verificado: a.verificado || b.verificado,
    notas: [a.notas, b.notas].filter(Boolean).join(' | '),
  };
}

// ============================================
// CLI: Ejecutar directamente
// ============================================

const esEjecucionDirecta = require.main === module;

if (esEjecucionDirecta) {
  // Parsear argumentos
  const args = process.argv.slice(2);
  const zonaArg = args.find((_, i) => args[i - 1] === '--zona');
  const tipoArg = args.find((_, i) => args[i - 1] === '--tipo');
  const soloGoogle = args.includes('--solo-google');
  const soloWeb = args.includes('--solo-web');
  const sinIA = args.includes('--sin-ia');
  const dryRun = args.includes('--dry-run');

  const opciones = {
    usarGoogleMaps: !soloWeb,
    usarPaginasAmarillas: !soloGoogle,
    usarWeb: !soloGoogle,
    enriquecerConIA: !sinIA,
    guardarEnDB: !dryRun,
  };

  if (zonaArg) {
    // Buscar zona específica
    const zona = ZONAS_CORDOBA.find(z =>
      z.ciudad.toLowerCase().includes(zonaArg.toLowerCase())
    );
    if (!zona) {
      console.error(`❌ Zona no encontrada: "${zonaArg}"`);
      console.log('Zonas disponibles:', ZONAS_CORDOBA.map(z => z.ciudad).join(', '));
      process.exit(1);
    }

    const tipos = tipoArg ? [tipoArg] : Object.keys(KEYWORDS_BUSQUEDA);
    console.log(`Prospectando en ${zona.ciudad} (${tipos.join(', ')})...`);

    prospectarTodo({ zonas: [zona], tipos, ...opciones })
      .then(results => {
        console.log('\n✅ Prospector finalizado');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Error:', error);
        process.exit(1);
      });

  } else {
    console.log(`
🔍 Veicolo Prospector — Buscador de prospectos

Uso:
  npx ts-node src/prospector/index.ts [opciones]

Opciones:
  --zona "Córdoba Capital"   Buscar solo en una zona
  --tipo gomeria             Buscar solo un tipo de negocio
  --solo-google              Solo usar Google Maps
  --solo-web                 Solo usar scraping web
  --sin-ia                   No enriquecer con Claude
  --dry-run                  No guardar en base de datos

Zonas disponibles:
  ${ZONAS_CORDOBA.map(z => z.ciudad).join('\n  ')}

Tipos de negocio:
  ${Object.keys(KEYWORDS_BUSQUEDA).join(', ')}

Ejemplo:
  npx ts-node src/prospector/index.ts --zona "Córdoba Capital" --tipo gomeria
  npx ts-node src/prospector/index.ts --zona "Río Cuarto" --solo-web --dry-run
`);
  }
}

console.log('✅ Prospector cargado');
