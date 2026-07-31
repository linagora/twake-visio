import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

// Une constante du module, pas un paramètre : un seul mode est démarrable
// depuis le mobile. Le jour où `transcript` sera livré, le paramètre s'ajoutera
// ici — et pas avant.
const SCREEN_RECORDING = 'screen_recording';

function toVoid(result: ApiResult<unknown>): ApiResult<void> {
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

// Aucune clé `options` : `RecordingOptions` porte `extra: "forbid"` côté
// serveur, et le corps le plus petit est le plus sûr. `language` ne servirait
// qu'à la transcription, que ce périmètre ne démarre pas.
export async function startRecording(account: Account, roomId: string): Promise<ApiResult<void>> {
  return toVoid(
    await authedFetch<unknown>(
      account,
      `/api/v1.0/rooms/${encodeURIComponent(roomId)}/start-recording/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: SCREEN_RECORDING }),
      },
    ),
  );
}

// Ni corps ni `content-type` : l'endpoint n'attend rien, et un
// `content-type: application/json` sur un corps vide fait échouer le parseur
// JSON de DRF — le 400 qui en sortirait serait indiscernable d'une requête mal
// formée. Il n'est pas exigé d'être celui qui a démarré l'enregistrement pour
// l'arrêter : le serveur retrouve le mode via l'enregistrement actif du salon.
export async function stopRecording(account: Account, roomId: string): Promise<ApiResult<void>> {
  return toVoid(
    await authedFetch<unknown>(
      account,
      `/api/v1.0/rooms/${encodeURIComponent(roomId)}/stop-recording/`,
      { method: 'POST' },
    ),
  );
}
