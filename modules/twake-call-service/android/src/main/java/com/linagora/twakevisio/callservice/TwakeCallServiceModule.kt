package com.linagora.twakevisio.callservice

import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Démarre et arrête le service de premier plan qui garde caméra et micro
 * vivants pendant une séance.
 *
 * Le pont ne fait rien d'autre : toute la décision — quand démarrer, quand
 * arrêter — vit dans `src/call/connection.ts`, à côté de la route audio dont le
 * cycle de vie est le même.
 */
class TwakeCallServiceModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    override fun definition() = ModuleDefinition {
        Name("TwakeCallService")

        // Les textes viennent de JavaScript pour rester dans les sept langues
        // du dépôt. Voir le commentaire de `CallForegroundService`.
        AsyncFunction("start") { title: String, body: String ->
            val intent = Intent(context, CallForegroundService::class.java)
                .putExtra(EXTRA_TITLE, title)
                .putExtra(EXTRA_BODY, body)
            // `startForegroundService()` LÈVE si l'application est déjà en
            // arrière-plan au moment de l'appel. Ce n'est pas le cas ici — on
            // démarre en rejoignant, écran allumé — mais l'appelant JavaScript
            // rattrape quand même : un service qui ne démarre pas ne doit
            // jamais empêcher d'entrer en séance.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        AsyncFunction("stop") {
            context.stopService(Intent(context, CallForegroundService::class.java))
        }

        // Un démontage de l'application ne doit pas laisser une notification
        // annonçant une séance qui n'existe plus — c'est la même raison que le
        // `OnDestroy` de `TwakeAudioDevicesModule`, qui relâche le mode audio.
        OnDestroy {
            context.stopService(Intent(context, CallForegroundService::class.java))
        }
    }
}
