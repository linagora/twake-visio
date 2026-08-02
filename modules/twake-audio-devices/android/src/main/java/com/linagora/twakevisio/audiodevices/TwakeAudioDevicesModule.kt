package com.linagora.twakevisio.audiodevices

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
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

private const val DEVICES_CHANGED = "onDevicesChanged"

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
 * Il ÉCRIT aussi : `acquire()` prend le focus audio, le mode de communication et
 * la route, que ce module tient alors seul. `AudioSwitchManager` n'est jamais
 * démarré sur ce chemin — c'est `src/call/audioRoute.ts` qui le garantit, à
 * l'unique endroit qui l'appelait. Deux composants qui arbitrent le même canal
 * sont la cause classique du « le son est reparti tout seul ».
 */
class TwakeAudioDevicesModule : Module() {
    private val audioManager: AudioManager
        get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private var focusRequest: AudioFocusRequest? = null
    private var previousMode: Int = AudioManager.MODE_NORMAL
    private var deviceListener: AudioManager.OnCommunicationDeviceChangedListener? = null

    override fun definition() = ModuleDefinition {
        Name("TwakeAudioDevices")

        Events(DEVICES_CHANGED)

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

        // Garde EXPRIMÉE EN POSITIF, et non par un `return@AsyncFunction` nu :
        // pour une lambda sans argument, Kotlin résout la surcharge
        // `AsyncFunction(name, body: () -> Any?)` (`ObjectDefinitionBuilder.kt:220-227`,
        // annotée `@JvmName("AsyncFunctionWithoutArgs")`), dont le type de
        // retour attendu n'est pas `Unit` — un `return@` sans valeur y est
        // refusé à la compilation. Les deux fonctions qui rendent une valeur
        // (`listDevices`, `getCurrentDeviceId`, `selectDevice`) peuvent, elles,
        // garder leur retour anticipé.
        AsyncFunction("acquire") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) acquireRoute()
        }

        AsyncFunction("release") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) releaseRoute()
        }

        AsyncFunction("selectDevice") { id: Int ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
            routeTo(id)
        }

        AsyncFunction("clearDevice") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) clearRoute()
        }

        // Un démontage de l'application ne doit pas laisser le mode de
        // communication et le focus posés : le haut-parleur resterait détourné
        // pour tout le système.
        OnDestroy {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) releaseRoute()
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

    // Le booléen est RENDU tel quel : un refus du système doit remonter jusqu'à
    // l'écran, qui laisse alors la coche où elle était plutôt que d'annoncer une
    // route qui n'a pas pris.
    @RequiresApi(Build.VERSION_CODES.S)
    private fun routeTo(id: Int): Boolean {
        val manager = audioManager
        val target = manager.availableCommunicationDevices.firstOrNull { it.id == id }
            ?: return false
        return manager.setCommunicationDevice(target)
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun clearRoute() {
        audioManager.clearCommunicationDevice()
    }

    // `@RequiresApi` plutôt qu'un simple `if` : le lint Android `NewApi` ne suit
    // pas la garde `SDK_INT` d'un appelant à travers un appel de méthode, et
    // `minSdkVersion` reste à 24. Sans cette annotation, `getMainExecutor()`
    // (API 28) et les quatre méthodes de route (API 31) font échouer le lint.
    @RequiresApi(Build.VERSION_CODES.S)
    private fun acquireRoute() {
        val manager = audioManager
        previousMode = manager.mode
        manager.mode = AudioManager.MODE_IN_COMMUNICATION

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener { }
            .build()
        focusRequest = request
        manager.requestAudioFocus(request)

        val listener = AudioManager.OnCommunicationDeviceChangedListener {
            sendEvent(DEVICES_CHANGED)
        }
        deviceListener = listener
        // `addOnCommunicationDeviceChangedListener` notifie AUSSI les
        // changements qu'un autre composant provoque — un casque qu'on allume,
        // la voiture qui se connecte. C'est le second angle mort du périmètre A
        // qui se lève ici.
        manager.addOnCommunicationDeviceChangedListener(
            context.mainExecutor,
            listener,
        )
    }

    // L'ordre n'est pas arbitraire : retirer l'écouteur AVANT de vider la route,
    // sinon `clearCommunicationDevice()` déclenche un dernier `sendEvent` vers
    // un runtime qui peut déjà être en train de partir. Puis rendre le focus,
    // puis restaurer le mode — dans l'ordre inverse de la prise.
    @RequiresApi(Build.VERSION_CODES.S)
    private fun releaseRoute() {
        val manager = audioManager
        deviceListener?.let { manager.removeOnCommunicationDeviceChangedListener(it) }
        deviceListener = null
        manager.clearCommunicationDevice()
        focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        focusRequest = null
        manager.mode = previousMode
    }
}
