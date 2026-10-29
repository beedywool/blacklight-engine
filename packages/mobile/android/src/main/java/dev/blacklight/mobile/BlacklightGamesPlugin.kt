package dev.blacklight.mobile

import androidx.activity.result.ActivityResult
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * `platform.invoke('playgames', …)` on Android: sign-in, achievements and the system
 * achievements screen, answered by [PlayGamesBackend] (Google Play Games Services v2 when the
 * game sets mobile.playGamesAppId, a stand-in that explains how to enable it otherwise).
 */
@CapacitorPlugin(name = "BlacklightGames")
class BlacklightGamesPlugin : Plugin() {
    private val backend by lazy { PlayGamesBackend(context) { activity } }

    @PluginMethod
    fun signIn(call: PluginCall) = backend.signIn(call)

    @PluginMethod
    fun unlock(call: PluginCall) {
        val id = call.getString("id")
        if (id.isNullOrBlank()) return call.reject("unlock() needs an achievement id.")
        backend.unlock(call, id)
    }

    @PluginMethod
    fun progress(call: PluginCall) {
        val id = call.getString("id")
        val current = call.getDouble("current")
        if (id.isNullOrBlank() || current == null) {
            return call.reject("progress() needs an achievement id and a current value.")
        }
        backend.progress(call, id, current.toInt())
    }

    @PluginMethod
    fun show(call: PluginCall) = backend.show(call) { intent ->
        startActivityForResult(call, intent, "achievementsClosed")
    }

    @ActivityCallback
    private fun achievementsClosed(call: PluginCall?, result: ActivityResult) {
        call?.resolve()
    }
}
