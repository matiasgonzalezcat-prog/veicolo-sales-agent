/**
 * Sender — Envía mensajes con comportamiento humano
 *
 * Simula "escribiendo..." y velocidad de tipeo real
 * antes de enviar cada mensaje
 */

import { getSocket } from './connection';
import {
  delayRespuesta,
  tiempoTipeo,
  deberiaPartirMensaje,
  partirMensaje,
  humanizarTexto,
  delayEntreMensajes
} from './humanizer';
import { registrarMensaje } from '../integrations/supabase';

interface EnvioOptions {
  /** ID del prospecto en sa_prospectos */
  prospectoId?: number;
  /** Tipo de mensaje para registro */
  tipo?: string;
  /** Si es true, NO aplica delay de respuesta (para mensajes inmediatos) */
  sinDelay?: boolean;
  /** Delay personalizado en segundos [min, max] */
  delayCustom?: [number, number];
}

/** Envía un mensaje con comportamiento humano completo */
export async function enviarMensaje(
  telefono: string,
  texto: string,
  options: EnvioOptions = {}
): Promise<boolean> {
  const sock = getSocket();
  if (!sock) {
    console.error('❌ WhatsApp no conectado');
    return false;
  }

  // Formatear JID de WhatsApp
  const jid = formatearJID(telefono);

  try {
    // 1. Delay antes de responder (3-4 min por defecto)
    if (!options.sinDelay) {
      const [min, max] = options.delayCustom || [180, 240];
      await delayRespuesta(min, max);
    }

    // 2. Humanizar el texto
    const textoHumano = humanizarTexto(texto);

    // 3. Decidir si partir el mensaje
    if (deberiaPartirMensaje(textoHumano)) {
      const partes = partirMensaje(textoHumano);

      for (let i = 0; i < partes.length; i++) {
        // Simular "escribiendo..."
        const tiempo = tiempoTipeo(partes[i]);
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(resolve => setTimeout(resolve, tiempo));
        await sock.sendPresenceUpdate('paused', jid);

        // Enviar parte
        await sock.sendMessage(jid, { text: partes[i] });
        console.log(`📤 Enviado (parte ${i + 1}/${partes.length}): "${partes[i].substring(0, 40)}..."`);

        // Delay entre partes
        if (i < partes.length - 1) {
          await delayEntreMensajes();
        }
      }
    } else {
      // Mensaje único
      const tiempo = tiempoTipeo(textoHumano);
      await sock.sendPresenceUpdate('composing', jid);
      await new Promise(resolve => setTimeout(resolve, tiempo));
      await sock.sendPresenceUpdate('paused', jid);

      await sock.sendMessage(jid, { text: textoHumano });
      console.log(`📤 Enviado: "${textoHumano.substring(0, 50)}..."`);
    }

    // 4. Registrar en Supabase
    if (options.prospectoId) {
      await registrarMensaje({
        prospecto_id: options.prospectoId,
        direccion: 'saliente',
        contenido: texto,
        tipo: options.tipo || 'respuesta_bot',
        estado: 'enviado'
      });
    }

    return true;
  } catch (error) {
    console.error(`❌ Error enviando mensaje a ${telefono}:`, error);
    return false;
  }
}

/** Marca un chat como "visto" (doble tilde azul) */
export async function marcarVisto(remoteJid: string, messageId: string, participant?: string) {
  const sock = getSocket();
  if (!sock) return;

  try {
    await sock.readMessages([{
      remoteJid,
      id: messageId,
      participant
    }]);
  } catch (error) {
    // No es crítico si falla
  }
}

/** Formatea un número argentino al formato JID de WhatsApp */
function formatearJID(telefono: string): string {
  // Limpiar el número
  let num = telefono.replace(/[\s\-\+\(\)]/g, '');

  // Si empieza con 0, quitar
  if (num.startsWith('0')) num = num.substring(1);

  // Si no empieza con 54 (código Argentina), agregar
  if (!num.startsWith('54')) num = '54' + num;

  // Formato WhatsApp: 549XXXXXXXXXX (sin el 15)
  // Si tiene 9 después del 54, dejarlo. Si no, agregarlo.
  if (num.startsWith('54') && !num.startsWith('549')) {
    num = '549' + num.substring(2);
  }

  return num + '@s.whatsapp.net';
}

console.log('✅ Sender cargado');
