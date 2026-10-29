package dev.blacklight.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import com.google.android.gms.games.PlayGames
import com.google.android.gms.games.leaderboard.LeaderboardVariant
import com.google.android.gms.games.PlayGamesSdk
import com.google.android.gms.tasks.Task

/**
 * Google Play Games Services v2. Compiled only into apps whose game.config.ts sets
 * mobile.playGamesAppId (the CLI sets the Gradle property blacklightPlayGames), so other games
 * ship without Google's SDK.
 */
internal class PlayGamesBackend(private val context: Context, private val activity: () -> Activity) {
    private var started = false

    /** Starts the SDK on first use; rejects the call when the app has no Play Games project id. */
    private fun ready(call: PluginCall): Boolean {
        val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
        if (info.metaData?.getString(APP_ID_KEY).isNullOrBlank()) {
            call.reject(
                "Play Games Services are not configured: set mobile.playGamesAppId in game.config.ts " +
                    "to the project id from the Play Console, then rebuild the app.",
                "UNAVAILABLE",
            )
            return false
        }
        if (!started) {
            PlayGamesSdk.initialize(context)
            started = true
        }
        return true
    }

    private fun <T> Task<T>.answer(call: PluginCall, what: String, done: (T) -> Unit) {
        addOnCompleteListener { task ->
            if (task.isSuccessful) {
                done(task.result)
            } else {
                call.reject("Play Games could not $what: ${task.exception?.message ?: "unknown error"}", task.exception)
            }
        }
    }

    fun signIn(call: PluginCall) {
        if (!ready(call)) return
        val client = PlayGames.getGamesSignInClient(activity())
        client.isAuthenticated.answer(call, "check the sign-in") { current ->
            if (current.isAuthenticated) {
                resolvePlayer(call)
            } else {
                client.signIn().addOnCompleteListener { task ->
                    if (task.isSuccessful && task.result.isAuthenticated) {
                        resolvePlayer(call)
                    } else {
                        call.resolve(JSObject().put("authenticated", false))
                    }
                }
            }
        }
    }

    private fun resolvePlayer(call: PluginCall) {
        PlayGames.getPlayersClient(activity()).currentPlayer.addOnCompleteListener { task ->
            val result = JSObject().put("authenticated", true)
            if (task.isSuccessful) {
                result.put("playerId", task.result.playerId)
                result.put("displayName", task.result.displayName)
            }
            call.resolve(result)
        }
    }

    /** Runs [then] with a signed-in player, showing Google's sign-in when needed. */
    private fun signedIn(call: PluginCall, then: () -> Unit) {
        if (!ready(call)) return
        val client = PlayGames.getGamesSignInClient(activity())
        client.isAuthenticated.answer(call, "check the sign-in") { current ->
            if (current.isAuthenticated) {
                then()
            } else {
                client.signIn().answer(call, "sign in") { result ->
                    if (result.isAuthenticated) then() else call.reject("The player did not sign in to Play Games.", "UNAVAILABLE")
                }
            }
        }
    }

    fun unlock(call: PluginCall, id: String) = signedIn(call) {
        PlayGames.getAchievementsClient(activity()).unlockImmediate(id).answer(call, "unlock \"$id\"") {
            call.resolve()
        }
    }

    fun submitScore(call: PluginCall, board: String, score: Long) = signedIn(call) {
        PlayGames.getLeaderboardsClient(activity()).submitScoreImmediate(board, score)
            .answer(call, "submit a score to \"$board\"") { call.resolve() }
    }

    fun scores(call: PluginCall, board: String, limit: Int) = signedIn(call) {
        PlayGames.getLeaderboardsClient(activity())
            .loadTopScores(board, LeaderboardVariant.TIME_SPAN_ALL_TIME, LeaderboardVariant.COLLECTION_PUBLIC, limit)
            .answer(call, "read \"$board\"") { data ->
                val entries = JSArray()
                val result = data.get()
                result?.scores?.let { buffer ->
                    for (score in buffer) {
                        entries.put(
                            JSObject()
                                .put("rank", score.rank)
                                .put("name", score.scoreHolderDisplayName)
                                .put("score", score.rawScore),
                        )
                    }
                    buffer.release()
                }
                result?.release()
                call.resolve(JSObject().put("entries", entries))
            }
    }

    fun progress(call: PluginCall, id: String, current: Int) = signedIn(call) {
        // Incremental achievements count steps (their total is set in the Play Console); the API
        // refuses 0 steps, which is the starting state anyway.
        if (current < 1) {
            call.resolve()
        } else {
            PlayGames.getAchievementsClient(activity()).setStepsImmediate(id, current)
                .answer(call, "set the progress of \"$id\"") { call.resolve() }
        }
    }

    fun show(call: PluginCall, open: (Intent) -> Unit) = signedIn(call) {
        PlayGames.getAchievementsClient(activity()).achievementsIntent.answer(call, "open the achievements", open)
    }

    private companion object {
        const val APP_ID_KEY = "com.google.android.gms.games.APP_ID"
    }
}
