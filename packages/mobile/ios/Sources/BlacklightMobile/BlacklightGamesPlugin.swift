import Capacitor
import Foundation
import GameKit

/// Game Center for `platform.invoke('gamecenter', …)`: sign-in, achievements and the system
/// achievements screen. Needs the Game Center capability (`mobile.gameCenter: true` in
/// game.config.ts makes the CLI add it).
@objc(BlacklightGamesPlugin)
public class BlacklightGamesPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "BlacklightGamesPlugin"
    public let jsName = "BlacklightGames"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "progress", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scores", returnType: CAPPluginReturnPromise),
    ]

    private var pendingShow: CAPPluginCall?

    private func playerResult(_ player: GKLocalPlayer) -> [String: Any] {
        guard player.isAuthenticated else { return ["authenticated": false] }
        return [
            "authenticated": true,
            "playerId": player.gamePlayerID,
            "displayName": player.displayName,
        ]
    }

    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(playerResult(player))
            return
        }
        authenticate { authenticated, error in
            if !authenticated, let error = error {
                call.resolve(["authenticated": false, "error": error.localizedDescription])
            } else {
                call.resolve(self.playerResult(player))
            }
        }
    }

    /// Runs `then` with a signed-in player, showing Game Center's sign-in when needed.
    private func signedIn(_ call: CAPPluginCall, then: @escaping () -> Void) {
        if GKLocalPlayer.local.isAuthenticated {
            then()
            return
        }
        authenticate { authenticated, error in
            if authenticated {
                then()
            } else {
                call.reject("The player did not sign in to Game Center\(error.map { ": \($0.localizedDescription)" } ?? ".")", "UNAVAILABLE")
            }
        }
    }

    private var authWaiters: [(Bool, Error?) -> Void] = []

    private func authenticate(_ done: @escaping (Bool, Error?) -> Void) {
        DispatchQueue.main.async {
            self.authWaiters.append(done)
            let player = GKLocalPlayer.local
            // Game Center calls the handler again later (sign-out, account change): only the
            // calls waiting at that moment are answered.
            player.authenticateHandler = { [weak self] controller, error in
                guard let self = self else { return }
                if let controller = controller {
                    self.bridge?.viewController?.present(controller, animated: true)
                    return
                }
                let waiters = self.authWaiters
                self.authWaiters.removeAll()
                for waiter in waiters { waiter(player.isAuthenticated, error) }
            }
        }
    }

    private func report(_ call: CAPPluginCall, id: String, percent: Double) {
        let achievement = GKAchievement(identifier: id)
        achievement.percentComplete = min(100, max(0, percent))
        achievement.showsCompletionBanner = true
        signedIn(call) {
            GKAchievement.report([achievement]) { error in
                if let error = error {
                    call.reject("Game Center could not report \"\(id)\": \(error.localizedDescription)")
                } else {
                    call.resolve()
                }
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let board = call.getString("board"), !board.isEmpty, let score = call.getDouble("score") else {
            call.reject("submitScore() needs a leaderboard id and a score.")
            return
        }
        signedIn(call) {
            GKLeaderboard.submitScore(Int(score), context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
                if let error = error {
                    call.reject("Game Center could not submit a score to \"\(board)\": \(error.localizedDescription)")
                } else {
                    call.resolve()
                }
            }
        }
    }

    @objc func scores(_ call: CAPPluginCall) {
        guard let board = call.getString("board"), !board.isEmpty else {
            call.reject("scores() needs a leaderboard id.")
            return
        }
        let limit = max(1, min(25, call.getInt("limit") ?? 10))
        signedIn(call) {
            GKLeaderboard.loadLeaderboards(IDs: [board]) { boards, error in
                guard let leaderboard = boards?.first else {
                    call.reject("Game Center has no leaderboard \"\(board)\"\(error.map { ": \($0.localizedDescription)" } ?? ".")")
                    return
                }
                leaderboard.loadEntries(for: .global, timeScope: .allTime, range: NSRange(location: 1, length: limit)) { _, entries, _, error in
                    if let error = error {
                        call.reject("Game Center could not read \"\(board)\": \(error.localizedDescription)")
                        return
                    }
                    let rows: [[String: Any]] = (entries ?? []).map {
                        ["rank": $0.rank, "name": $0.player.displayName, "score": $0.score]
                    }
                    call.resolve(["entries": rows])
                }
            }
        }
    }

    @objc func unlock(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else {
            call.reject("unlock() needs an achievement id.")
            return
        }
        report(call, id: id, percent: 100)
    }

    @objc func progress(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty,
              let current = call.getDouble("current"), let total = call.getDouble("total"), total > 0
        else {
            call.reject("progress() needs an achievement id, a current value and a total above 0.")
            return
        }
        report(call, id: id, percent: current / total * 100)
    }

    @objc func show(_ call: CAPPluginCall) {
        signedIn(call) {
            DispatchQueue.main.async {
                let controller = GKGameCenterViewController(state: .achievements)
                controller.gameCenterDelegate = self
                self.pendingShow = call
                self.bridge?.viewController?.present(controller, animated: true)
            }
        }
    }

    public func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) {
        controller.dismiss(animated: true)
        pendingShow?.resolve()
        pendingShow = nil
    }
}
