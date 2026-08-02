package com.linagora.twakevisio.audiodevices

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Les quatre catégories que la feuille sait présenter, et rien d'autre. HDMI,
// TÉLÉPHONIE, REMOTE_SUBMIX… sont bien des sorties, ce ne sont pas des sorties
// de séance. Le tri final est fait côté JavaScript (`src/call/audioDevices.ts`),
// qui est le seul endroit testable : ce module ne fait que transporter.
private val SUPPORTED_TYPES = intArrayOf(
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_HEARING_AID,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER,
)

/**
 * Lecture des sorties audio de la séance, par APPAREIL, sur Android 12 (API 31)
 * et au-delà.
 *
 * Ce que ce module rend et qu'aucune API n'offrait au périmètre A : le NOM réel
 * de chaque appareil, un par appareil et non un par catégorie, et l'état
 * CONSTATÉ de la route. `AudioSwitch` réduit chaque appareil à sa classe
 * (`AudioDeviceKind.fromAudioDevice`), et son ensemble trié absorbe le second
 * Bluetooth — vérifié dans le bytecode : `AudioDevicePriorityComparator.compare`
 * rend `0` dès que les deux classes sont égales, et `availableUniqueAudioDevices`
 * est un `SortedSet`.
 *
 * La TÂCHE 4 y ajoute l'écriture. Tant qu'elle n'est pas là, ce module ne change
 * aucune route : il lit.
 */
class TwakeAudioDevicesModule : Module() {
    private val audioManager: AudioManager
        get() {
            val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
            return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        }

    override fun definition() = ModuleDefinition {
        Name("TwakeAudioDevices")

        // Le seul point de vérité du plancher. Le JavaScript ne teste jamais
        // `Platform.Version` lui-même : une seule source, côté natif.
        Function("isSupported") {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        }

        AsyncFunction("listDevices") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                return@AsyncFunction emptyList<Map<String, Any>>()
            }
            readDevices()
        }

        AsyncFunction("getCurrentDeviceId") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction null
            readCurrentDeviceId()
        }
    }

    // `@RequiresApi` plutôt que de laisser l'appel d'API 31 dans le corps de la
    // lambda : le lint Android `NewApi` suit mal une garde `SDK_INT` posée à
    // l'intérieur d'une lambda, et `minSdkVersion` reste à 24. La garde de
    // l'appelant est conservée — c'est elle qui décide —, l'annotation ne fait
    // que la rendre lisible par le lint.
    @RequiresApi(Build.VERSION_CODES.S)
    private fun readDevices(): List<Map<String, Any>> =
        audioManager.availableCommunicationDevices
            .filter { SUPPORTED_TYPES.contains(it.type) }
            .map { info ->
                mapOf(
                    "id" to info.id,
                    "type" to info.type,
                    // `getProductName()` rend le modèle du TÉLÉPHONE pour les
                    // sorties intégrées : c'est `audioDevices.ts` qui décide de
                    // ne le garder que pour le Bluetooth.
                    "name" to info.productName.toString(),
                )
            }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun readCurrentDeviceId(): Int? = audioManager.communicationDevice?.id
}
