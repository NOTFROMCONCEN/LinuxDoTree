(function (globalScope) {
    "use strict";

    const SETTINGS_SCHEMA_VERSION = 2;

    const DEFAULT_SETTINGS = {
        settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
        autoRedirect: true,
        defaultSortMode: "old",
        interceptLinks: true,
        allowFlatView: true,
        rememberModePreference: true,
        forceNestedPriority: true,
        enableFloatingToggle: false,
        enableReplyFolding: true,
        enableIndentLines: false,
        enableGoParentButton: true,
        enableParentChainHighlight: false,
        optimizeBoosts: false,
        recommendBoostForShortReplies: false,
        preferredMode: "nested",
        categoryWhitelist: ""
    };

    const FORCED_DISABLED_FIELDS = [
        "enableIndentLines",
        "enableParentChainHighlight",
        "optimizeBoosts",
        "recommendBoostForShortReplies"
    ];

    function normalizeSortMode(mode, legacyForceOldSort) {
        if (mode === "top" || mode === "new" || mode === "old" || mode === "default") {
            return mode;
        }

        return legacyForceOldSort ? "old" : "default";
    }

    function normalizeSettings(settings) {
        const incoming = settings || {};
        const next = { ...DEFAULT_SETTINGS, ...incoming };

        const rawVersion = Number.parseInt(incoming.settingsSchemaVersion, 10);
        const previousVersion = Number.isFinite(rawVersion) ? rawVersion : 0;

        next.defaultSortMode = normalizeSortMode(next.defaultSortMode, next.forceOldSort);
        delete next.forceOldSort;
        next.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;

        if (previousVersion < 2 && typeof incoming.forceNestedPriority === "undefined") {
            next.forceNestedPriority = true;
        }

        FORCED_DISABLED_FIELDS.forEach((key) => {
            next[key] = false;
        });

        return next;
    }

    const sharedApi = {
        SETTINGS_SCHEMA_VERSION,
        DEFAULT_SETTINGS: Object.freeze({ ...DEFAULT_SETTINGS }),
        FORCED_DISABLED_FIELDS: Object.freeze([...FORCED_DISABLED_FIELDS]),
        normalizeSortMode,
        normalizeSettings
    };

    globalScope.LINUXDOTREE_SHARED = Object.freeze(sharedApi);
})(typeof globalThis !== "undefined" ? globalThis : window);
