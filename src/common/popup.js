(function () {
    "use strict";

    const shared = (typeof globalThis !== "undefined" && globalThis.LINUXDOTREE_SHARED) || {};
    const DEFAULT_SETTINGS = {
        ...(shared.DEFAULT_SETTINGS || {}),
        enableReplyFolding: true,
        optimizeBoosts: false
    };
    const normalizeSettings = shared.normalizeSettings || ((settings) => ({ ...DEFAULT_SETTINGS, ...settings }));

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

    function save(patch) {
        storage.get(null, (items) => {
            const next = normalizeSettings({ ...items, ...patch, optimizeBoosts: false });
            storage.set(next, () => {
                render(next);
                setStatus("已保存");

                const enabled = Boolean(next.autoRedirect || next.interceptLinks);
                syncActiveTabAfterToggle(enabled);
            });
        });
    }

    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById("version");
    if (versionEl) {
        versionEl.textContent = manifest.version_name || manifest.version || "";
    }

    function checkForUpdate() {
        const REPO = "NOTFROMCONCEN/LinuxDoTree";
        const CACHE_KEY = "linuxdotree_update_cache";
        const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

        const currentVersion = (manifest.version_name || manifest.version || "").replace(/^v/, "");

        function compareVersions(a, b) {
            const pa = a.replace(/-.*$/, "").split(".").map(Number);
            const pb = b.replace(/-.*$/, "").split(".").map(Number);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                const diff = (pa[i] || 0) - (pb[i] || 0);
                if (diff !== 0) return diff;
            }
            // same numeric part: release > beta
            const aSuffix = a.includes("-") ? 0 : 1;
            const bSuffix = b.includes("-") ? 0 : 1;
            return aSuffix - bSuffix;
        }

        function showBanner(latestVersion, releaseUrl) {
            const banner = document.getElementById("update-banner");
            if (!banner) return;
            banner.textContent = `⬆️ 发现新版本 ${latestVersion}，点击前往下载`;
            banner.href = releaseUrl;
            banner.hidden = false;
            banner.addEventListener("click", (e) => {
                e.preventDefault();
                chrome.tabs.create({ url: releaseUrl });
            });
        }

        chrome.storage.local.get([CACHE_KEY], (cached) => {
            const now = Date.now();
            const entry = cached[CACHE_KEY];
            if (entry && now - entry.fetchedAt < CACHE_TTL) {
                if (compareVersions(entry.latestVersion, currentVersion) > 0) {
                    showBanner(entry.latestVersion, entry.releaseUrl);
                }
                return;
            }

            fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
                headers: { Accept: "application/vnd.github+json" }
            })
                .then((r) => r.ok ? r.json() : Promise.reject(r.status))
                .then((data) => {
                    const latestVersion = (data.tag_name || "").replace(/^v/, "");
                    const releaseUrl = data.html_url || `https://github.com/${REPO}/releases/latest`;
                    chrome.storage.local.set({
                        [CACHE_KEY]: { latestVersion, releaseUrl, fetchedAt: now }
                    });
                    if (compareVersions(latestVersion, currentVersion) > 0) {
                        showBanner(latestVersion, releaseUrl);
                    }
                })
                .catch(() => { /* 网络失败静默忽略 */ });
        });
    }

    checkForUpdate();

    storage.get(null, (items) => {
        const next = normalizeSettings({ ...items, optimizeBoosts: false });
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
