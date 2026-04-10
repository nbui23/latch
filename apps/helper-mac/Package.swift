// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LatchHelper",
    platforms: [.macOS(.v12)],
    targets: [
        .executableTarget(
            name: "LatchHelper",
            path: "Sources/LatchHelper"
        ),
        .testTarget(
            name: "LatchHelperTests",
            dependencies: ["LatchHelper"],
            path: "Tests/LatchHelperTests"
        )
    ]
)
