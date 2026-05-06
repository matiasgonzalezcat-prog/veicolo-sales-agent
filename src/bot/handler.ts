/**
 * Handler — Procesa mensajes entrantes de WhatsApp
 *
 * Flujo:
 * 1. Identificar al prospecto (conocido, cliente existente, o nuevo)
 * 2. Analizar intención del mensaje con Claude
 * 3. Buscar productos si corresponde
 * 4. Generar respuesta inteligente
 * 5. Actualizar scoring y pipeline
 * 6. Notificar a Tute si es lead caliente o transferencia
 */

import { proto } from '@whiskeysockets/baileys';
import {
  buscarProspectoPorTelefono,
  buscarClientePorTelefono,
  crearProspecto,
  registrarMensaje,
  actualizarEtapa,
  buscarProductos,
  supabase
} from '../integrations/supabase';
import { analizarIntencion, generarRespuesta } from '../integrations/claude';
import { enviarMensaje, marcarVisto } from './sender';
import { agregarSenal } from '../scoring/calculator';
import {
  notificarLeadCaliente,
  notificarTransferencia,
  notificarLeadNuevo
} from '../notifications/notify';

/** Extrae el número de teléfono de un JID */
function extraerTelefono(jid: string): string {
  return jid.replace('@s.whatsapp.net', '').replace('@lid', '');
}

/** Extrae el texto de un mensaje */
function extraerTexto(msg: proto.IWebMessageInfo): string {
  return msg.message?.conversation
    || msg.message?.extendedTextMessage?.text
    || '';
}

/** Obtiene los últimos mensajes de un prospecto para dar contexto */
async function obtenerHistorial(prospectoId: number, limit = 6): Promise<string[]> {
  const { data } = await supabase
    .from('sa_mensajes')
    .select('direccion, contenido')
    .eq('prospecto_id', prospectoId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.reverse().map(m =>
    `${m.direccion === 'entrante' ? 'Cliente' : 'Vendedor'}: ${m.contenido}`
  );
}

/** Handler principal de mensajes entrantes */
export async function handleMensaje(msg: proto.IWebMessageInfo): Promise<void> {
  const remoteJid = msg.key.remoteJid!;
  const telefono = extraerTelefono(remoteJid);
  const texto = extraerTexto(msg);
  const messageId = msg.key.id!;

  if (!texto.trim()) return;

  console.log(`\n🔍 Procesando mensaje de ${telefono}: "${texto}"`);

  // Marcar como visto (con delay para parecer humano)
  setTimeout(() => marcarVisto(remoteJid, messageId), 2000);

  // 1. Buscar si ya es un prospecto conocido
  let prospecto = await buscarProspectoPorTelefono(telefono);
  let esNuevo = false;

  // 2. Si no es prospecto, buscar si es cliente existente
  if (!prospecto) {
    const clienteExistente = await buscarClientePorTelefono(telefono);

    if (clienteExistente) {
      console.log(`👤 Cliente existente: ${clienteExistente.nombre} (${clienteExistente.codigo})`);
      prospecto = await crearProspecto({
        nombre_negocio: clienteExistente.nombre || 'Cliente existente',
        tipo_negocio: 'otro',
        telefono,
        fuente: 'lead_entrante',
        notas: `Cliente existente en Fidel/Supabase. Código: ${clienteExistente.codigo}. Vendedor: ${clienteExistente.vendedor || 'sin asignar'}`
      });
      esNuevo = true;
    } else {
      // 3. Es alguien nuevo → registrar como lead entrante
      console.log(`🆕 Lead entrante nuevo: ${telefono}`);
      prospecto = await crearProspecto({
        nombre_negocio: 'Lead entrante',
        tipo_negocio: 'otro',
        telefono,
        fuente: 'lead_entrante',
        notas: `Contacto espontáneo. Primer mensaje: "${texto.substring(0, 200)}"`
      });
      esNuevo = true;
    }
  }

  if (!prospecto) {
    console.error('❌ No se pudo crear/encontrar prospecto');
    return;
  }

  // 4. Registrar el mensaje entrante
  await registrarMensaje({
    prospecto_id: prospecto.id,
    direccion: 'entrante',
    contenido: texto,
    tipo: 'consulta',
    estado: 'enviado'
  });

  // Notificar lead nuevo
  if (esNuevo) {
    await notificarLeadNuevo(telefono, texto, prospecto.id);
  }

  // 5. Actualizar etapa si corresponde
  if (prospecto.etapa === 'contactado') {
    await actualizarEtapa(prospecto.id, 'respondio');
    await agregarSenal(prospecto.id, 'respondio_primer_mensaje', prospecto.score || 0, 'Respondió al primer contacto');
    console.log(`📈 Prospecto ${prospecto.nombre_negocio} pasó a "respondio"`);
  }

  // 6. Analizar intención con Claude
  const contexto = {
    nombre_negocio: prospecto.nombre_negocio,
    tipo_negocio: prospecto.tipo_negocio,
    ciudad: prospecto.ciudad,
    etapa: prospecto.etapa,
    score: prospecto.score || 0,
    historial: await obtenerHistorial(prospecto.id)
  };

  const intencion = await analizarIntencion(texto, contexto);
  console.log(`🧠 Intención detectada: ${intencion.intencion} | Sentimiento: ${intencion.sentimiento}`);

  // 7. Buscar productos si mencionó alguno
  let productos: any[] = [];
  if (intencion.productos_mencionados.length > 0) {
    for (const prod of intencion.productos_mencionados) {
      const resultados = await buscarProductos(prod, 5);
      productos.push(...resultados);
    }
    if (productos.length > 0) {
      console.log(`🔎 Encontré ${productos.length} productos relacionados`);
    }
  }

  // 8. Actualizar scoring según intención
  if (intencion.intencion === 'consulta_producto') {
    await agregarSenal(prospecto.id, 'pregunto_productos', prospecto.score || 0, intencion.resumen);
  }
  if (intencion.quiere_precio || intencion.quiere_cantidad) {
    await agregarSenal(prospecto.id, 'pregunto_precio_cantidad', prospecto.score || 0, intencion.resumen);
  }
  if (intencion.intencion === 'pedido') {
    await agregarSenal(prospecto.id, 'pidio_oferta', prospecto.score || 0, intencion.resumen);
  }

  // 9. Generar respuesta con Claude
  const respuesta = await generarRespuesta(texto, contexto, intencion, productos);
  console.log(`💬 Respuesta generada: "${respuesta.texto.substring(0, 60)}..."`);

  // 10. Enviar respuesta con humanización
  await enviarMensaje(telefono, respuesta.texto, {
    prospectoId: prospecto.id,
    tipo: 'respuesta_bot'
  });

  // 11. Procesar señales detectadas por Claude
  for (const senal of respuesta.senales_detectadas) {
    await agregarSenal(prospecto.id, senal, prospecto.score || 0, `Detectado por IA: ${intencion.resumen}`);
  }

  // 12. Refrescar score actualizado
  const prospectoActualizado = await buscarProspectoPorTelefono(telefono);
  const scoreActual = prospectoActualizado?.score || 0;
  const categoriaActual = prospectoActualizado?.categoria_score || 'frio';

  // 13. Manejar transferencia si Claude lo sugiere
  if (respuesta.deberia_transferir) {
    await notificarTransferencia(
      prospecto.nombre_negocio,
      telefono,
      respuesta.motivo_transferencia || 'Quiere comprar / necesita atención personal',
      prospecto.id
    );
    await actualizarEtapa(prospecto.id, 'presupuesto_enviado');
    console.log(`🔄 Transferencia a Tute solicitada: ${respuesta.motivo_transferencia}`);
  }

  // 14. Notificar si el lead se puso caliente
  if (categoriaActual === 'caliente' || categoriaActual === 'ardiendo') {
    await notificarLeadCaliente(
      prospecto.nombre_negocio,
      telefono,
      scoreActual,
      prospecto.ciudad || 'desconocida',
      prospecto.id
    );
  }

  console.log(`✅ Mensaje procesado. Score: ${scoreActual} (${categoriaActual})`);
}

console.log('✅ Handler de mensajes cargado');
