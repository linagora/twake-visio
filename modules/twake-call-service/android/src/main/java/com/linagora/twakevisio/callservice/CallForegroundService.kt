package com.linagora.twakevisio.callservice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

internal const val EXTRA_TITLE = "title"
internal const val EXTRA_BODY = "body"

private const val CHANNEL_ID = "twakevisio.call"
private const val NOTIFICATION_ID = 1

/**
 * Le service qui garde la capture vivante quand l'application passe en
 * arrière-plan.
 *
 * MESURÉ sans lui, sur Pixel 10 Pro Fold (API 36) : cinq secondes après le
 * passage en arrière-plan, `dumpsys media.camera` journalise
 * `DISCONNECT device 1 … (PID 0)` — un retrait par le SYSTÈME — et
 * `dumpsys audio` fait tomber `Recording active` à `false`. La lecture continue,
 * donc on entend les autres pendant qu'eux ne nous voient ni ne nous entendent
 * plus. `useInterruptionRecovery` répare le RETOUR ; ce service répare
 * l'ABSENCE, et les deux sont nécessaires — une permission peut être retirée
 * en pleine séance, ce qu'aucun service ne rattrape.
 *
 * Les textes de la notification arrivent de JavaScript, jamais d'une ressource
 * Android : les sept langues du dépôt vivent dans `src/i18n/locales`, et un
 * `strings.xml` en doublerait une partie sans que `src/i18n/index.spec.ts` ne
 * puisse le voir.
 */
class CallForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    // `startForeground()` doit être appelé dans les cinq secondes qui suivent
    // `startForegroundService()`, sinon le système tue le processus avec un
    // `ForegroundServiceDidNotStartInTimeException`. Tout est donc fait ici, de
    // façon synchrone, sans le moindre travail différé.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE).orEmpty()
        val body = intent?.getStringExtra(EXTRA_BODY).orEmpty()

        ensureChannel()
        val notification = buildNotification(title, body)

        // Le type doit être passé à partir d'Android 10, et il doit
        // correspondre à ce que déclare le manifeste. En dessous, la surcharge
        // typée n'existe pas — et la restriction qu'elle sert non plus.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // `START_NOT_STICKY` : si le système tue le processus, il ne doit PAS
        // relancer ce service tout seul. Il n'y aurait plus de séance derrière,
        // et la notification annoncerait un appel qui n'existe pas.
        return START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        // `IMPORTANCE_LOW` : visible et persistante, mais sans son ni vibration.
        // Une séance en cours n'a pas à sonner pour s'annoncer.
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, title(), NotificationManager.IMPORTANCE_LOW),
        )
    }

    // Le nom du canal est celui que le système affiche dans les réglages de
    // notification. Il n'y a pas d'`Intent` pour le porter — le canal se crée
    // avant la première notification — donc c'est le nom de l'application, que
    // le système localise déjà.
    private fun title(): CharSequence =
        applicationInfo.loadLabel(packageManager)

    private fun buildNotification(title: String, body: String): Notification {
        val builder =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Notification.Builder(this, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(this)
            }

        // Une icône du système plutôt qu'une ressource à nous : `android/` est
        // produit par `expo prebuild` et n'est pas versionné, donc y ajouter un
        // drawable demanderait un plugin de configuration de plus pour un
        // combiné téléphonique.
        builder
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_CALL)

        // Toucher la notification doit ramener DANS la séance. Sans cela, la
        // seule façon de revenir est de retrouver l'application à la main,
        // ce qui est exactement ce qu'on lui demande d'éviter.
        launchIntent()?.let { builder.setContentIntent(it) }

        return builder.build()
    }

    private fun launchIntent(): PendingIntent? {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return null
        // `FLAG_IMMUTABLE` est EXIGÉ depuis Android 12 : sans lui,
        // `getActivity()` lève un `IllegalArgumentException` et la notification
        // ne part pas du tout.
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}
