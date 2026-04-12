// Generated file. Do not edit directly.
// Source: src/infra/host-env-security-policy.json
// Regenerate: node scripts/generate-host-env-security-policy-swift.mjs --write

import Foundation

enum HostEnvSecurityPolicy {
    static let blockedKeys: Set<String> = [

    ]

    static let blockedOverrideKeys: Set<String> = [

    ]

    static let blockedOverridePrefixes: [String] = [
        "GIT_CONFIG_",
        "NPM_CONFIG_"
    ]

    static let blockedPrefixes: [String] = [
        "BASH_FUNC_",
        "DYLD_",
        "LD_"
    ]
}
