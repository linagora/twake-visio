import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';
import { CALL_SURFACE_HAIRLINE, CALL_SURFACE_TINT } from './callHeader';
import { RecordingIndicator } from './recordingIndicator';

// Aucune des 14 clés que ce composant affiche n'interpole (contrairement à
// `waiting.knocking` ou `call.cameraNumbered`) : un mock ignorant son second
// argument ne masquerait donc aucune substitution de champ ici. Voir
// `recordingLabelKey` (src/call/recording.ts) — la table est une fonction pure
// de `state.phase`/`state.mode` vers une clé fixe, jamais une chaîne composée.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RecordingIndicator', () => {
  it('ne rend rien au repos', async () => {
    await render(<RecordingIndicator state={{ phase: 'idle', mode: null }} />);

    expect(screen.queryByTestId('recording-indicator')).toBe(null);
  });

  it('annonce le démarrage', async () => {
    const state: RecordingState = { phase: 'starting', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.starting');
  });

  it('annonce un enregistrement en cours', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active');
  });

  it('nomme une transcription pour ce qu’elle est', async () => {
    // Un participant web peut démarrer une transcription : répondre
    // « enregistrement » serait un mensonge sur un sujet de consentement.
    const state: RecordingState = { phase: 'recording', mode: 'transcript' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent(
      'recording.transcriptActive',
    );
  });

  it('reste visible pendant la sauvegarde', async () => {
    const state: RecordingState = { phase: 'saving', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.saving');
  });

  it('dit l’interruption plutôt que de retomber au silence', async () => {
    // Sans ce libellé, un enregistrement mort serait indiscernable d'un
    // enregistrement jamais démarré.
    const state: RecordingState = { phase: 'aborted', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.aborted');
  });

  // C1, même famille que waitingBanner.spec.tsx et cameraMenu.spec.tsx :
  // `call.tsx` force un fond sombre alors que `makeTheme` rend désormais le
  // thème TOUJOURS clair. Sans cette couleur explicite, le texte retomberait
  // sur `theme.colors.onSurface` (#141815, quasi invisible sur ce fond). RNTL
  // ne rend pas les couleurs : ce test ne peut garder que le style est bien
  // posé, pas qu'il rend lisible. 13,62:1 sur le lavis de la puce.
  it('pose la couleur claire du texte sur le lavis de sa puce', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  // On force la SURFACE et le TEXTE, ou ni l'un ni l'autre. Un lavis NEUTRE et
  // non l'ambre du signal de main levée : cet indicateur annonce aussi bien un
  // enregistrement en cours qu'une transcription, une sauvegarde ou une
  // interruption, et une couleur d'alerte mentirait sur trois de ces quatre.
  it('pose le lavis neutre de la puce et son filet', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator-chip')).toHaveStyle({
      backgroundColor: CALL_SURFACE_TINT,
      borderColor: CALL_SURFACE_HAIRLINE,
      borderRadius: 13,
    });
  });

  it('ne pose aucune puce au repos', async () => {
    // L'autre borne de la même conditionnelle : sans elle, une puce rendue
    // inconditionnellement laisserait un cadre vide au-dessus de la scène.
    await render(<RecordingIndicator state={{ phase: 'idle', mode: null }} />);

    expect(screen.queryByTestId('recording-indicator-chip')).toBe(null);
  });
});
