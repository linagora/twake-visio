import type { InstanceFeatures } from 'src/instance/types';

// Même forme que `canStartRecording` (`src/call/recording.ts:126`), qui est le
// précédent de ce dépôt pour une capacité d'instance qui éteint une surface.
//
// La surface d'agenda est la liste « Réunions · -2 h → +24 h » de l'accueil,
// qui appartient au Lot 2 de la refonte. Cette garde est livrée maintenant, sans
// consommateur, pour que le Lot 2 n'ait pas à rouvrir `discovery.ts` : il lui
// suffira d'appeler ceci.
//
// Elle est FERMÉE partout aujourd'hui, faute de signal observable — voir
// `InstanceFeatures.calendar` pour la mesure du 2026-08-02 sur les trois
// instances connues.
export function canShowAgenda(features: InstanceFeatures): boolean {
  return features.calendar;
}
