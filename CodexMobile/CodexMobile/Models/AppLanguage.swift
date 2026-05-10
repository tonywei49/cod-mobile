// FILE: AppLanguage.swift
// Purpose: Persisted app language selection for SwiftUI localization.
// Layer: Model
// Exports: AppLanguage

import Foundation
import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case system
    case english
    case traditionalChinese

    static let storageKey = "codex.appLanguage"
    static let defaultStoredRawValue = AppLanguage.system.rawValue

    var id: String { rawValue }

    var locale: Locale {
        guard let localeIdentifier else {
            return .autoupdatingCurrent
        }
        return Locale(identifier: localeIdentifier)
    }

    var localeIdentifier: String? {
        switch self {
        case .system:
            return nil
        case .english:
            return "en"
        case .traditionalChinese:
            return "zh-Hant"
        }
    }

    var titleKey: LocalizedStringKey {
        switch self {
        case .system:
            return "System"
        case .english:
            return "English"
        case .traditionalChinese:
            return "Traditional Chinese"
        }
    }
}

enum AppLocalizedText {
    static func text(_ key: String) -> Text {
        Text(LocalizedStringKey(key))
    }
}
