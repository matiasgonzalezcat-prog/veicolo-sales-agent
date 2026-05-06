/**
 * Veicolo Sales Agent — Entry point
 *
 * Conecta WhatsApp, registra handlers, y mantiene el bot corriendo 24/7
 */

import dotenv from 'dotenv';
dotenv.config();

import { conectarWhatsApp, onMessage } from './bot/connection';
import { handleMensaje } from './bot/handler';

// Banner de inicio
console.log(`
╔══════════════════════════════════════════╗
║       Veicolo Sales Agent v1.0.0         ║
║   Sistema de ventas automatizado con IA  ║
╚══════════════════════════════════════════╝
`);

console.log(`📅 ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' })}`);
console.log(`🔧 Entorno: ${process.env.NODE_ENV || 'development'}`);
console.log('');

// Verificar variables de entorno requeridas
const requiredEnvVars = ['SUPABASE_ANON_KEY'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error(`❌ Variables de entorno faltantes: ${missing.join(', ')}`);
  console.error('   Creá un archivo .env basado en .env.example');
  process.exit(1);
}

/** Arranque principal */
async function main() {
  try {
    console.log('🚀 Iniciando Veicolo Sales Agent...\n');

    // 1. Registrar handler de mensajes
    onMessage(handleMensaje);
    console.log('📨 Handler de mensajes registrado');

    // 2. Conectar WhatsApp
    console.log('📱 Conectando a WhatsApp...\n');
    await conectarWhatsApp();

    console.log('\n✅ Sales Agent activo y escuchando mensajes');
    console.log('   Ctrl+C para detener\n');

  } catch (error) {
    console.error('❌ Error fatal iniciando el Sales Agent:', error);
    process.exit(1);
  }
}

// Manejo de señales para shutdown limpio
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo Sales Agent...');
  console.log('👋 Hasta la próxima, Tute!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM recibido. Apagando...');
  process.exit(0);
});

// Capturar errores no manejados para que no crashee
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // No matar el proceso por errores no críticos
  // Solo errores fatales deberían detener el bot
});

// Arrancar
main();
