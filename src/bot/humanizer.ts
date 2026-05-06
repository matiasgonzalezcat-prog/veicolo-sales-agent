/**
 * Humanizer — Hace que el bot se comporte como una persona real
 *
 * - Delay de 3-4 minutos antes de responder
 * - Tipeo a velocidad humana (~5 seg cada 10 chars)
 * - Variaciones aleatorias para no ser predecible
 */

/** Genera un delay aleatorio entre min y max segundos */
export function randomDelay(minSeg: number, maxSeg: number): number {
  return Math.floor(Math.random() * (maxSeg - minSeg + 1) + minSeg) * 1000;
}

/** Delay antes de responder (3-4 minutos) */
export function delayRespuesta(minSeg = 180, maxSeg = 240): Promise<void> {
  const delay = randomDelay(minSeg, maxSeg);
  console.log(`⏳ Esperando ${Math.round(delay / 1000)}s antes de responder...`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/** Calcula el tiempo de tipeo para un mensaje */
export function tiempoTipeo(texto: string, segPor10Chars = 5): number {
  const baseTime = (texto.length / 10) * segPor10Chars * 1000;
  // Variación ±20% para que no sea exacto
  const variacion = baseTime * (0.8 + Math.random() * 0.4);
  return Math.max(variacion, 1500); // Mínimo 1.5 segundos
}

/** Decide si dividir un mensaje largo en 2 mensajes cortos */
export function deberiaPartirMensaje(texto: string): boolean {
  // 30% de probabilidad de partir mensajes largos (>100 chars)
  if (texto.length > 100 && Math.random() < 0.3) return true;
  // Si tiene salto de línea natural, 50% de probabilidad
  if (texto.includes('\n') && Math.random() < 0.5) return true;
  return false;
}

/** Parte un mensaje en 2 partes naturales */
export function partirMensaje(texto: string): string[] {
  // Buscar un punto de corte natural
  const puntosDCorte = ['. ', '! ', '? ', '\n', ', '];
  const mitad = Math.floor(texto.length / 2);

  for (const punto of puntosDCorte) {
    const idx = texto.indexOf(punto, mitad - 30);
    if (idx > 0 && idx < mitad + 30) {
      return [
        texto.substring(0, idx + punto.trim().length).trim(),
        texto.substring(idx + punto.length).trim()
      ].filter(Boolean);
    }
  }

  // Si no encuentra punto natural, no partir
  return [texto];
}

/** Humaniza un texto para que parezca escrito por una persona en WhatsApp */
export function humanizarTexto(texto: string): string {
  let result = texto;

  // A veces quitar tildes (30% de probabilidad por palabra)
  const sinTildes: Record<string, string> = { 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' };
  if (Math.random() < 0.3) {
    result = result.replace(/[áéíóú]/g, char => sinTildes[char] || char);
  }

  // A veces empezar en minúscula (40%)
  if (Math.random() < 0.4 && result.length > 0) {
    result = result.charAt(0).toLowerCase() + result.slice(1);
  }

  // Nunca usar signos de exclamación/interrogación de apertura
  result = result.replace(/[¡¿]/g, '');

  return result;
}

/** Delay entre mensajes cuando se parte en 2 (3-8 segundos) */
export function delayEntreMensajes(): Promise<void> {
  const delay = randomDelay(3, 8);
  return new Promise(resolve => setTimeout(resolve, delay));
}

console.log('✅ Humanizer cargado');
