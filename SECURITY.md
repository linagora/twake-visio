# Politique de sécurité

## Signaler une faille

**N'ouvrez pas d'issue publique.** Écrivez à **info@linagora.com**, en mettant
`[SÉCURITÉ] twake-visio` en objet.

Si le signalement privé de vulnérabilités est activé sur ce dépôt, l'onglet
_Security_ → _Report a vulnerability_ fonctionne aussi et garde l'échange dans
GitHub.

Merci d'inclure ce qui permet de reproduire :

- la version de l'application — l'écran **Réglages** l'affiche en bas ;
- la plateforme et sa version (Android 15, iOS 26.2…) ;
- l'instance meet visée, si elle est publique ;
- les étapes, et ce que vous obtenez au lieu de ce que vous attendiez ;
- l'impact tel que vous le voyez, même approximatif.

Nous accusons réception sous **5 jours ouvrés** et vous tenons informé de
l'analyse. Si la faille est confirmée, nous convenons avec vous d'une date de
divulgation ; le crédit vous revient, sauf si vous préférez l'anonymat.

## Ce dépôt, et ce qui n'en relève pas

Ce dépôt ne contient que le **client mobile**. Il ne porte ni salon, ni compte,
ni droit d'accès : tout cela vit ailleurs.

| ce que vous avez trouvé                                  | où le signaler                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| l'application mobile — stockage local, OIDC, permissions | ici, à info@linagora.com                                                 |
| le serveur de visioconférence                            | [`suitenumerique/meet`](https://github.com/suitenumerique/meet/security) |
| le transport temps réel                                  | [LiveKit](https://github.com/livekit/livekit/security)                   |
| une instance déployée par LinAgora                       | info@linagora.com                                                        |

En cas de doute, écrivez-nous : il vaut mieux un signalement mal adressé qu'une
faille tue.

## Versions couvertes

Le projet est en `0.x` et n'a pas encore de branche de maintenance : les
correctifs partent sur la **dernière version publiée**, et elle seule.

| version    | couverte |
| ---------- | -------- |
| 0.8.x      | oui      |
| antérieure | non      |

## Ce qui est hors périmètre

- Les rapports issus d'un scanner automatique, sans démonstration d'impact.
- Les faiblesses qui supposent un appareil déjà compromis, débridé ou sous
  contrôle d'un tiers.
- Les défauts d'une instance meet tierce que nous n'exploitons pas.
- L'absence de durcissements optionnels — épinglage de certificat, détection de
  débridage — sur laquelle un rapport reste bienvenu, mais qui relève de
  l'évolution et non de la faille.
