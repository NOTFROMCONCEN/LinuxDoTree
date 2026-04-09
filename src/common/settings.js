(function (globalScope) {
    "use strict";

    const DEFAULT_SETTINGS = {
        autoRedirect: true,
        defaultSortMode: "old",
        interceptLinks: true,
        allowFlatView: true,
        rememberModePreference: true,
        enableFloatingToggle: true,
        enableReplyFolding: true,
        enableParentChainHighlight: false,
        optimizeBoosts: false,
        recommendBoostForShortReplies: false,
        preferredMode: "nested",
        categoryWhitelist: ""
    };

    const FORCED_DISABLED_FIELDS = [
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
        const next = { ...DEFAULT_SETTINGS, ...(settings || {}) };
        next.defaultSortMode = normalizeSortMode(next.defaultSortMode, next.forceOldSort);
        delete next.forceOldSort;

        FORCED_DISABLED_FIELDS.forEach((key) => {
            next[key] = false;
        });

        return next;
    }

    const sharedApi = {
        DEFAULT_SETTINGS: Object.freeze({ ...DEFAULT_SETTINGS }),
        FORCED_DISABLED_FIELDS: Object.freeze([...FORCED_DISABLED_FIELDS]),
        normalizeSortMode,
        normalizeSettings
    };

    globalScope.LINUXDOTREE_SHARED = Object.freeze(sharedApi);
})(typeof globalThis !== "undefined" ? globalThis : window);
