// swift-tools-version: 5.9
// iOS side of @blacklight/mobile (BlacklightGames: Game Center). `cap sync ios` adds it to the
// app's CapApp-SPM package under the name Capacitor derives from the npm name.
import PackageDescription

let package = Package(
    name: "BlacklightMobile",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "BlacklightMobile",
            targets: ["BlacklightMobile"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "BlacklightMobile",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/BlacklightMobile",
            linkerSettings: [.linkedFramework("GameKit")])
    ]
)
