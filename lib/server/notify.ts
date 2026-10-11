import { db } from "./supabase";

export const gameTopic = (gameId: string) => `game:${gameId}`;

/**
 * Ping realtime "qualcosa è cambiato": i client rileggono lo stato dalle API.
 * Il payload non contiene dati di gioco, quindi il canale può essere pubblico.
 * Se il ping si perde, l'heartbeat dei client recupera comunque lo stato.
 */
export async function notifyGame(gameId: string): Promise<void> {
  const client = db();
  const channel = client.channel(gameTopic(gameId));
  try {
    await channel.httpSend("changed", { at: Date.now() }, { timeout: 3000 });
  } catch (err) {
    console.warn("notifyGame failed", err);
  } finally {
    await client.removeChannel(channel);
  }
}
