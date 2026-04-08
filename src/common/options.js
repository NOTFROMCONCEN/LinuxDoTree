(function () {
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
    const FORCED_DISABLED_FIELDS = ["enableParentChainHighlight", "optimizeBoosts", "recommendBoostForShortReplies"];

    const storage = chrome.storage.sync;
    const form = document.getElementById("settings-form");
    const status = document.getElementById("status");
    const resetButton = document.getElementById("reset");

    const fields = {
        autoRedirect: document.getElementById("autoRedirect"),
        defaultSortMode: document.getElementById("defaultSortMode"),
        interceptLinks: document.getElementById("interceptLinks"),
        allowFlatView: document.getElementById("allowFlatView"),
        rememberModePreference: document.getElementById("rememberModePreference"),
        enableFloatingToggle: document.getElementById("enableFloatingToggle"),
        enableFloatingWidgetPlaceholder: document.getElementById("enableFloatingWidgetPlaceholder"),
        enableReplyFolding: document.getElementById("enableReplyFolding"),
        enableParentChainHighlight: document.getElementById("enableParentChainHighlight"),
        optimizeBoosts: document.getElementById("optimizeBoosts"),
        recommendBoostForShortReplies: document.getElementById("recommendBoostForShortReplies"),
        categoryWhitelist: document.getElementById("categoryWhitelist")
    };

    function setStatus(message) {
        status.textContent = message;
        window.clearTimeout(setStatus.timerId);
        setStatus.timerId = window.setTimeout(() => {
            status.textContent = "";
        }, 1800);
    }

    function fillForm(settings) {
        Object.entries(fields).forEach(([key, field]) => {
            if (field instanceof HTMLTextAreaElement) {
                field.value = settings[key] || "";
                return;
            }

            if (field instanceof HTMLSelectElement) {
                field.value = settings[key] || DEFAULT_SETTINGS[key] || "";
                return;
            }

            if (field.disabled) {
                field.checked = false;
                return;
            }

            field.checked = Boolean(settings[key]);
        });
    }

    function readForm() {
        return Object.fromEntries(
            Object.entries(fields).map(([key, field]) => {
                if (field instanceof HTMLTextAreaElement) {
                    return [key, field.value.trim()];
                }

                if (field instanceof HTMLSelectElement) {
                    return [key, field.value];
                }

                if (field.disabled) {
                    return [key, false];
                }

                return [key, field.checked];
            })
        );
    }

    function normalizeSettings(settings) {
        const next = { ...DEFAULT_SETTINGS, ...settings };
        if (!next.defaultSortMode) {
            next.defaultSortMode = next.forceOldSort ? "old" : "default";
        }
        delete next.forceOldSort;
        FORCED_DISABLED_FIELDS.forEach((key) => {
            next[key] = false;
        });
        return next;
    }

    function loadSettings() {
        storage.get(null, (items) => {
            const normalized = normalizeSettings(items);
            storage.set(normalized, () => {
                fillForm(normalized);
            });
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        storage.set(normalizeSettings(readForm()), () => {
            setStatus("设置已保存");
        });
    });

    resetButton.addEventListener("click", () => {
        const normalized = normalizeSettings(DEFAULT_SETTINGS);
        storage.set(normalized, () => {
            fillForm(normalized);
            setStatus("已恢复默认设置");
        });
    });

    const versionEl = document.getElementById("version");
    if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = "v" + (manifest.version_name || manifest.version || "");
    }

    loadSettings();
})();
