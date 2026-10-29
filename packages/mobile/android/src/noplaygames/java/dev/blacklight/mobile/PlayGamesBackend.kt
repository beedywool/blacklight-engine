package dev.blacklight.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import com.getcapacitor.PluginCall

/**
 * Stand-in compiled when game.config.ts has no mobile.playGamesAppId: the app ships without
 * Google's Play Games SDK and every call says how to enable it.
 */
@Suppress("UNUSED_PARAMETER")
internal class PlayGamesBackend(context: Context, activity: () -> Activity) {
    private fun unavailable(call: PluginCall) {
        call.reject(
            "Play Games Services are not in this build: set mobile.playGamesAppId in game.config.ts " +
                "to the project id from the Play Console, then rebuild the app.",
            "UNAVAILABLE",
        )
    }

    fun signIn(call: PluginCall) = unavailable(call)

    fun unlock(call: PluginCall, id: String) = unavailable(call)

    fun progress(call: PluginCall, id: String, current: Int) = unavailable(call)

    fun submitScore(call: PluginCall, board: String, score: Long) = unavailable(call)

    fun scores(call: PluginCall, board: String, limit: Int) = unavailable(call)

    fun show(call: PluginCall, open: (Intent) -> Unit) = unavailable(call)
}
