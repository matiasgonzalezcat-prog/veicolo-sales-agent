/**
 * Notificaciones — Avisa a Tute cuando hay algo importante
 *
 * Usa WhatsApp para enviar notificaciones al número de Tute
 * sobre leads calientes, transferencias pendientes, etc.
 */

import { enviarMensaje } from '../bot/sender';
import { getConfig } from '../integrations/supabase';

/** Número de Tute para notificaciones (se configura en sa_config) */
let tuteNumero: string | null = null;

/** Cargar número de Tute desde config */
async function getNumeroTute(): Promise<string | null> {
  if (tuteNumero) return tuteNumero;
  tuteNumero = await getConfig('telefono_notificaciones');
  return tuteNumero;
}

/** Tipos de notificación */
type TipoNotificacion = 'lead_caliente' | 'transferencia' | 'lead_nuevo' | 'error' | 'resumen_diario';

/** Estructura de una notificación */
interface Notificacion {
  tipo: TipoNotificacion;
  titulo: string;
  detalle: string;
  prospectoId?: number;
  urgente?: boolean;
}

/** Cola de notificaciones para no spammear a Tute */
const colaNotificaciones: Notificacion[] = [];
let procesandoCola = false;

/** Intervalo mínimo entre notificaciones (en ms) */
const MIN_INTERVALO = 60_000; // 1 minuto
let ultimaNotificacion = 0;

/** Envía una notificación a Tute */
export async function notificar(notif: Notificacion): Promise<void> {
  const numero = await getNumeroTute();
  if (!numero) {
    console.warn('⚠️ No hay número de notificaciones configurado en sa_config (clave: telefono_notificaciones)');
    console.log(`📢 [${notif.tipo}] ${notif.titulo}: ${notif.detalle}`);
    return;
  }

  // Si es urgente, enviar directo
  if (notif.urgente) {
    await enviarNotificacion(numero, notif);
    return;
  }

  // Si no es urgente, encolar
  colaNotificaciones.push(notif);
  procesarCola(numero);
}

/** Procesa la cola de notificaciones respetando el intervalo mínimo */
async function procesarCola(numero: string): Promise<void> {
  if (procesandoCola) return;
  procesandoCola = true;

  while (colaNotificaciones.length > 0) {
    const ahora = Date.now();
    const tiempoDesdeUltima = ahora - ultimaNotificacion;

    if (tiempoDesdeUltima < MIN_INTERVALO) {
      // Esperar lo que falta para completar el intervalo
      await new Promise(resolve => setTimeout(resolve, MIN_INTERVALO - tiempoDesdeUltima));
    }

    const notif = colaNotificaciones.shift();
    if (notif) {
      await enviarNotificacion(numero, notif);
      ultimaNotificacion = Date.now();
    }
  }

  procesandoCola = false;
}

/** Formatea y envía la notificación */
async function enviarNotificacion(numero: string, notif: Notificacion): Promise<void> {
  const icono = {
    lead_caliente: '🔥',
    transferencia: '🔄',
    lead_nuevo: '🆕',
    error: '❌',
    resumen_diario: '📊'
  }[notif.tipo];

  const mensaje = `${icono} *${notif.titulo}*\n\n${notif.detalle}`;

  try {
    await enviarMensaje(numero, mensaje, {
      sinDelay: true,  // Las notificaciones se envían al toque
    });
    console.log(`📢 Notificación enviada a Tute: [${notif.tipo}] ${notif.titulo}`);
  } catch (error) {
    console.error('Error enviando notificación:', error);
  }
}

// ============================================
// Funciones de conveniencia
// ============================================

/** Notifica un lead caliente que necesita atención */
export async function notificarLeadCaliente(
  nombreNegocio: string,
  telefono: string,
  score: number,
  ciudad: string,
  prospectoId: number
): Promise<void> {
  await notificar({
    tipo: 'lead_caliente',
    titulo: `Lead caliente: ${nombreNegocio}`,
    detalle: `Score: ${score}/100\nTel: ${telefono}\nCiudad: ${ciudad}\nYa le hablé, parece interesado. Contactalo!`,
    prospectoId,
    urgente: true
  });
}

/** Notifica que un lead pidió hablar con alguien / transferencia */
export async function notificarTransferencia(
  nombreNegocio: string,
  telefono: string,
  motivo: string,
  prospectoId: number
): Promise<void> {
  await notificar({
    tipo: 'transferencia',
    titulo: `Transferir: ${nombreNegocio}`,
    detalle: `Tel: ${telefono}\nMotivo: ${motivo}\nEl prospecto espera que lo contactes entre las 10 y 13 hs.`,
    prospectoId,
    urgente: true
  });
}

/** Notifica un nuevo lead entrante */
export async function notificarLeadNuevo(
  telefono: string,
  primerMensaje: string,
  prospectoId: number
): Promise<void> {
  await notificar({
    tipo: 'lead_nuevo',
    titulo: 'Nuevo lead entrante',
    detalle: `Tel: ${telefono}\nDijo: "${primerMensaje.substring(0, 100)}"`,
    prospectoId
  });
}

/** Envía resumen diario de actividad */
export async function enviarResumenDiario(stats: {
  leadsNuevos: number;
  mensajesEnviados: number;
  mensajesRecibidos: number;
  transferencias: number;
  leadsCalientes: number;
}): Promise<void> {
  const detalle = [
    `Leads nuevos: ${stats.leadsNuevos}`,
    `Mensajes enviados: ${stats.mensajesEnviados}`,
    `Mensajes recibidos: ${stats.mensajesRecibidos}`,
    `Transferencias: ${stats.transferencias}`,
    `Leads calientes: ${stats.leadsCalientes}`
  ].join('\n');

  await notificar({
    tipo: 'resumen_diario',
    titulo: 'Resumen del día',
    detalle
  });
}

console.log('✅ Sistema de notificaciones cargado');
