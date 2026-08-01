import React from 'react';

import type { ParticipantRole } from 'src/api/participants';
import type { ChatSnapshot } from 'src/call/chatStore';
import type { Box } from 'src/call/grid';
import type { CallLayout, ParticipantView, Tile } from 'src/call/layout';
import { ChatPanel } from 'src/screens/room/chatPanel';
import { ParticipantsPanel } from 'src/screens/room/participantsPanel';
import { CallStage } from 'src/screens/room/stage';

// Trois états qui s'excluent, et non deux booléens : deux booléens
// autoriseraient quatre combinaisons dont une impossible — les deux panneaux
// ouverts sur la même région d'écran.
//
// Déclaré ici plutôt que dans `call.tsx`, bien que ce soit l'écran qui porte
// l'état : c'est ce routeur-ci qui discrimine dessus, et l'écran l'importe.
// L'inverse fabriquerait un cycle entre les deux modules.
export type Panel = 'none' | 'participants' | 'chat';

export type CallPanelsProps = {
  // Lu, jamais écrit. Ce routeur n'a AUCUN moyen de changer de panneau : c'est
  // `openPanel` dans `call.tsx` qui en est la seule porte, et elle sort du
  // plein écran avant tout. Lui donner un `onPanelChange` rouvrirait le chemin
  // que cette porte existe précisément pour fermer.
  readonly panel: Panel;

  // Le panneau des participants.
  readonly participants: readonly ParticipantView[];
  readonly canModerate: boolean;
  readonly onMute: (identity: string, trackSid: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;

  // Le panneau de discussion.
  readonly chat: ChatSnapshot;
  // Rend `true` quand le message est parti : voir `ChatPanelProps.onSend`, dont
  // ceci n'est que le relais.
  readonly onSendChat: (body: string) => Promise<boolean>;
  readonly onCloseChat: () => void;

  // La scène, qui est aussi le cas par défaut.
  readonly layout: CallLayout | null;
  readonly onMeasureBox: (box: Box) => void;
  readonly onPressStageTile: () => void;
  readonly onPinTile: (key: string) => void;
  readonly onFullscreenTile: (key: string) => void;
  readonly onUnpinTile: () => void;
  readonly onExitFullscreen: () => void;
  readonly fullscreenTile: Tile | null;
};

// Le panneau remplace la scène plutôt que de se poser par-dessus : les deux se
// disputeraient la même vidéo, qui est la raison d'être de cet écran. La barre
// de contrôle, elle, reste en place dans les trois cas — quitter reste toujours
// possible. Les participants se referment par le même bouton qui les ouvre ; le
// chat porte sa propre sortie, parce que son point d'entrée est une ligne de
// feuille et non une bascule de barre.
//
// Un aiguillage et rien d'autre : aucun état, aucun effet, aucune requête. Les
// trois corps sont mutuellement exclusifs, et `CallStage` est bien DÉMONTÉE
// quand un panneau s'ouvre — c'est ce qui oblige l'épinglage et le plein écran
// à vivre dans l'écran plutôt qu'ici.
export function CallPanels({
  panel,
  participants,
  canModerate,
  onMute,
  onRemove,
  onRole,
  chat,
  onSendChat,
  onCloseChat,
  layout,
  onMeasureBox,
  onPressStageTile,
  onPinTile,
  onFullscreenTile,
  onUnpinTile,
  onExitFullscreen,
  fullscreenTile,
}: CallPanelsProps): React.ReactElement {
  if (panel === 'participants') {
    return (
      <ParticipantsPanel
        participants={participants}
        canModerate={canModerate}
        onMute={onMute}
        onRemove={onRemove}
        onRole={onRole}
      />
    );
  }

  if (panel === 'chat') {
    return <ChatPanel chat={chat} onSend={onSendChat} onClose={onCloseChat} />;
  }

  // Parti pris mobile : locuteur actif en grand, vignettes en bande. La grille
  // du web rend chaque visage illisible sur un écran de téléphone.
  return (
    <CallStage
      layout={layout}
      onMeasureBox={onMeasureBox}
      onPressStageTile={onPressStageTile}
      onPinTile={onPinTile}
      onFullscreenTile={onFullscreenTile}
      onUnpinTile={onUnpinTile}
      onExitFullscreen={onExitFullscreen}
      fullscreenTile={fullscreenTile}
    />
  );
}
