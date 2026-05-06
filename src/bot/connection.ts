/**
 * Conexión a WhatsApp via Baileys
 * Maneja la conexión, autenticación QR, y reconexión automática
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import path from 'path';

const AUTH_DIR = path.join(process.cwd(), 'auth_info_baileys');
const logger = pino({ level: 'silent' }); // Silenciar logs internos de Baileys

let sock: WASocket | null = null;

export type MessageHandler = (msg: proto.IWebMessageInfo) => Promise<void>;

let onMessageCallback: MessageHandler | null = null;

/** Registra el handler de mensajes entrantes */
export function onMessage(handler: MessageHandler) {
  onMessageCallback = handler;
}

/** Obtiene la instancia del socket */
export function getSocket(): WASocket | null {
  return sock;
}

/** Inicia la conexión con WhatsApp */
export async function conectarWhatsApp(): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: true, // Muestra QR en consola para vincular
    browser: ['Veicolo Sales Agent', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  // Guardar credenciales cuando se actualizan
  sock.ev.on('creds.update', saveCreds);

  // Manejar estado de conexión
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Escaneá este QR con WhatsApp para vincular el número:');
      console.log('   (Abrí WhatsApp → Dispositivos vinculados → Vincular dispositivo)\n');
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`⚠️ Conexión cerrada. Código: ${statusCode}`);

      if (shouldReconnect) {
        console.log('🔄 Reconectando en 5 segundos...');
        setTimeout(() => conectarWhatsApp(), 5000);
      } else {
        console.log('❌ Sesión cerrada. Eliminá la carpeta auth_info_baileys y volvé a vincular.');
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado correctamente');
      console.log('📞 Número vinculado y listo para recibir mensajes\n');
    }
  });

  // Manejar mensajes entrantes
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // Solo mensajes nuevos, no historial

    for (const msg of messages) {
      // Ignorar mensajes propios, de grupos, y de status
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;
      if (msg.key.remoteJid === 'status@broadcast') continue;

      // Extraer texto del mensaje
      const texto = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';

      if (!texto) continue; // Ignorar mensajes sin texto (fotos, audios, etc.)

      console.log(`📩 Mensaje de ${msg.key.remoteJid}: "${texto.substring(0, 50)}..."`);

      // Llamar al handler registrado
      if (onMessageCallback) {
        try {
          await onMessageCallback(msg);
        } catch (error) {
          console.error('Error procesando mensaje:', error);
        }
      }
    }
  });

  return sock;
}

console.log('✅ Módulo de conexión WhatsApp cargado');
