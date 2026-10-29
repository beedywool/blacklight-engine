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
    ]

    private var pendingSignIn: [CAPPluginCall] = []
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
        DispatchQueue.main.async {
            self.pendingSignIn.append(call)
            // Game Center calls the handler again later (sign-out, account change): only the
            // calls waiting at that moment are answered.
            player.authenticateHandler = { [weak self] controller, error in
                guard let self = self else { return }
                if let controller = controller {
                    self.bridge?.viewController?.present(controller, animated: true)
                    return
                }
                let calls = self.pendingSignIn
                self.pendingSignIn.removeAll()
                for waiting in calls {
                    if let error = error, !player.isAuthenticated {
                        waiting.resolve(["authenticated": false, "error": error.localizedDescription])
                    } else {
                        waiting.resolve(self.playerResult(player))
                    }
                }
            }
        }
    }

    private func report(_ call: CAPPluginCall, id: String, percent: Double) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Game Center is not signed in: call signIn() first.", "UNAVAILABLE")
            return
        }
        let achievement = GKAchievement(identifier: id)
        achievement.percentComplete = min(100, max(0, percent))
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error {
                call.reject("Game Center could not report \"\(id)\": \(error.localizedDescription)")
            } else {
                call.resolve()
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
        DispatchQueue.main.async {
            let controller = GKGameCenterViewController(state: .achievements)
            controller.gameCenterDelegate = self
            self.pendingShow = call
            self.bridge?.viewController?.present(controller, animated: true)
        }
    }

    public func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) {
        controller.dismiss(animated: true)
        pendingShow?.resolve()
        pendingShow = nil
    }
}
