(function () {
    "use strict";

    const DEFAULT_SETTINGS = {
        autoRedirect: true,
        defaultSortMode: "old",
        interceptLinks: true,
        allowFlatView: true,
        enableReplyFolding: true,
        optimizeBoosts: false
    };

    const storage = chrome.storage.sync;

    const enabledField = document.getElementById("enabled");
    const autoRedirectField = document.getElementById("autoRedirect");
    const defaultSortModeField = document.getElementById("defaultSortMode");
    const allowFlatViewField = document.getElementById("allowFlatView");
    const enableReplyFoldingField = document.getElementById("enableReplyFolding");
    const openOptionsButton = document.getElementById("openOptions");
    const openSiteButton = document.getElementById("openSite");
    const status = document.getElementById("status");

    function getFlatUrl(originalUrl) {
        try {
            const url = new URL(originalUrl);
            if (!/^(?:www\.)?linux\.do$/i.test(url.hostname)) {
                return originalUrl;
            }
            if (!url.pathname.startsWith("/nested/")) {
                return originalUrl;
            }
            url.pathname = url.pathname.replace(/^\/nested\//, "/t/");
            return url.href;
        } catch (error) {
            return originalUrl;
        }
    }

    function syncActiveTabAfterToggle(enabled) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs && tabs[0];
            if (!activeTab || !activeTab.url) {
                return;
            }

            if (!enabled && /^https?:\/\/linux\.do\/nested\//.test(activeTab.url)) {
                chrome.tabs.update(activeTab.id, { url: getFlatUrl(activeTab.url) });
            }
        });
    }

    function setStatus(message) {
        status.textContent = message;
        clearTimeout(setStatus.timerId);
        setStatus.timerId = window.setTimeout(() => {
            status.textContent = "";
        }, 1600);
    }

    function normalizeEnabled(enabled) {
        return enabled
            ? {
                autoRedirect: true,
                interceptLinks: true
            }
            : {
                autoRedirect: false,
                interceptLinks: false
            };
    }

    function render(settings) {
        enabledField.checked = Boolean(settings.autoRedirect || settings.interceptLinks);
        autoRedirectField.checked = Boolean(settings.autoRedirect);
        defaultSortModeField.value = settings.defaultSortMode || "old";
        allowFlatViewField.checked = Boolean(settings.allowFlatView);
        enableReplyFoldingField.checked = Boolean(settings.enableReplyFolding);
    }

    function normalizeSettings(settings) {
        const next = { ...DEFAULT_SETTINGS, ...settings };
        if (!next.defaultSortMode) {
            next.defaultSortMode = next.forceOldSort ? "old" : "default";
        }
        delete next.forceOldSort;
        next.optimizeBoosts = false;
        return next;
    }

    function save(patch) {
        storage.get(null, (items) => {
            const next = normalizeSettings({ ...items, ...patch });
            storage.set(next, () => {
                render(next);
                setStatus("已保存");

                const enabled = Boolean(next.autoRedirect || next.interceptLinks);
                syncActiveTabAfterToggle(enabled);
            });
        });
    }

    const versionEl = document.getElementById("version");
    if (versionEl) {
        const manifest = chrome.runtime.getManifest();
        versionEl.textContent = manifest.version_name || manifest.version || "";
    }

    storage.get(null, (items) => {
        const next = normalizeSettings(items);
        storage.set(next, () => {
            render(next);
        });
    });

    enabledField.addEventListener("change", () => {
        save(normalizeEnabled(enabledField.checked));
    });

    defaultSortModeField.addEventListener("change", () => {
        save({ defaultSortMode: defaultSortModeField.value });
    });

    allowFlatViewField.addEventListener("change", () => {
        save({ allowFlatView: allowFlatViewField.checked });
    });

    autoRedirectField.addEventListener("change", () => {
        save({ autoRedirect: autoRedirectField.checked });
    });

    enableReplyFoldingField.addEventListener("change", () => {
        save({ enableReplyFolding: enableReplyFoldingField.checked });
    });

    openOptionsButton.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
    });

    openSiteButton.addEventListener("click", () => {
        chrome.tabs.create({ url: "https://linux.do" });
    });
})();
