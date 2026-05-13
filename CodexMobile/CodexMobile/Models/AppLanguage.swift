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
    case japanese
    case korean
    case spanish
    case french

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
        case .japanese:
            return "ja"
        case .korean:
            return "ko"
        case .spanish:
            return "es"
        case .french:
            return "fr"
        }
    }

    var title: String {
        switch self {
        case .system:
            return "System"
        case .english:
            return "English"
        case .traditionalChinese:
            return "繁體中文"
        case .japanese:
            return "日本語"
        case .korean:
            return "한국어"
        case .spanish:
            return "Español"
        case .french:
            return "Français"
        }
    }
}

enum AppLocalizedText {
    static func text(_ key: String) -> Text {
        Text(LocalizedStringKey(key))
    }
}
