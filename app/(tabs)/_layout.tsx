import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { TabBarIcon } from 'src/ui/tabBarIcon';
import { tokens } from 'src/ui/tokens';

// `expo-router/js-tabs` et non `expo-router` : le second réexporte le même
// composant mais son entrée est marquée `@deprecated` en 57
// (`build/exports.d.ts:41`).
//
// Aucun `@react-navigation/*` n'est installé, et il n'en faut aucun : expo-router
// EMBARQUE bottom-tabs, sous `build/react-navigation/bottom-tabs`. Ce n'est donc
// pas un pair manquant à cause de `legacy-peer-deps` — le réflexe qu'impose
// `AGENTS.md` — mais une dépendance interne.
//
// La barre reste celle de la bibliothèque, seule l'icône est à nous : la
// pastille arrondie du mockup n'est rendable par aucune option, alors que les
// teintes, le fond et la typographie du libellé le sont. Écrire un `tabBar`
// complet aurait voulu dire câbler `state`, `descriptors` et `navigation` à la
// main pour ce seul aplat.
//
// expo-router requires a default export for every file under app/.
export default function TabsLayout(): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tokens.color.brandStrong,
        tabBarInactiveTintColor: tokens.color.textTabInactive,
        tabBarLabelStyle: {
          fontFamily: tokens.font.bold,
          fontSize: tokens.typography.tabLabel.fontSize,
        },
        tabBarStyle: {
          backgroundColor: tokens.color.cardSurface,
          borderTopColor: tokens.color.cardBorder,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} name="video-outline" testID="tab-icon-home" />
          ),
          title: t('tabs.home'),
        }}
      />
      <Tabs.Screen
        name="historique"
        options={{
          tabBarButtonTestID: 'tab-historique',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} name="clock-outline" testID="tab-icon-historique" />
          ),
          title: t('tabs.history'),
        }}
      />
      <Tabs.Screen
        name="reglages"
        options={{
          tabBarButtonTestID: 'tab-reglages',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon focused={focused} name="cog-outline" testID="tab-icon-reglages" />
          ),
          title: t('tabs.settings'),
        }}
      />
    </Tabs>
  );
}
