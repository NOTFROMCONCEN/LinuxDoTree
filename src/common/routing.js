(function (globalScope) {
    "use strict";

    const shared = (typeof globalThis !== "undefined" && globalThis.LINUXDOTREE_SHARED) || {};
    const normalizeSortMode =
        shared.normalizeSortMode ||
        ((mode, legacyForceOldSort) =>
            mode === "top" || mode === "new" || mode === "old" || mode === "default"
                ? mode
                : legacyForceOldSort
                    ? "old"
                    : "default");

    function isLinuxDoHostname(hostname) {
        return /^(?:www\.)?linux\.do$/i.test(String(hostname || ""));
    }

    function isLinuxDoUrl(urlLike) {
        try {
            const url = typeof urlLike === "string" ? new URL(urlLike) : urlLike;
            return Boolean(url && isLinuxDoHostname(url.hostname));
        } catch {
            return false;
        }
    }

    function isTreePath(pathname) {
        const path = String(pathname || "");
        return path.startsWith("/n/") || path.startsWith("/nested/");
    }

    function getTopicIdFromPath(pathname) {
        const match = String(pathname || "").match(/\/(?:t|n|nested)\/(?:[^/]+\/)?(\d+)(?:\/\d+)?\/?$/);
        return match ? match[1] : null;
    }

    function isTopicLink(href) {
        const value = String(href || "");
        return /^\/(?:t|n|nested)\//.test(value) || /^https?:\/\/(?:www\.)?linux\.do\/(?:t|n|nested)\//.test(value);
    }

    function setSortModeOnUrl(originalUrl, sortMode) {
        try {
            const isRelative = String(originalUrl || "").startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);
            const normalized = normalizeSortMode(sortMode, false);

            if (normalized === "default") {
                url.searchParams.delete("sort");
            } else {
                url.searchParams.set("sort", normalized);
            }

            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch {
            return originalUrl;
        }
    }

    function getNestedUrl(originalUrl, settings) {
        try {
            const isRelative = String(originalUrl || "").startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);

            if (!isLinuxDoUrl(url)) {
                return originalUrl;
            }

            let newPath = url.pathname;

            if (/^\/(?:t|n|nested)\/[^/]+\/\d+(?:\/\d+)?\/?$/.test(newPath)) {
                newPath = newPath.replace(
                    /^\/(?:t|n|nested)\/([^/]+)\/(\d+)(?:\/\d+)?\/?$/,
                    "/n/$1/$2"
                );
            } else if (/^\/(?:t|n|nested)\/\d+(?:\/\d+)?\/?$/.test(newPath)) {
                newPath = newPath.replace(/^\/(?:t|n|nested)\/(\d+)(?:\/\d+)?\/?$/, "/n/$1");
            } else if (/^\/(?:t|n|nested)\//.test(newPath)) {
                newPath = newPath.replace(/^\/(?:t|n|nested)\//, "/n/");
            } else if (!newPath.startsWith("/n/")) {
                return originalUrl;
            }

            url.pathname = newPath;

            const mode = normalizeSortMode(settings && settings.defaultSortMode, settings && settings.forceOldSort);
            if (mode === "default") {
                url.searchParams.delete("sort");
            } else {
                url.searchParams.set("sort", mode);
            }

            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch {
            return originalUrl;
        }
    }

    function getFlatUrl(originalUrl) {
        try {
            const isRelative = String(originalUrl || "").startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);

            if (!isLinuxDoUrl(url) || !isTreePath(url.pathname)) {
                return originalUrl;
            }

            url.pathname = url.pathname.replace(/^\/(?:n|nested)\//, "/t/");
            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch {
            return originalUrl;
        }
    }

    const api = {
        isLinuxDoUrl,
        isTreePath,
        getTopicIdFromPath,
        isTopicLink,
        setSortModeOnUrl,
        getNestedUrl,
        getFlatUrl
    };

    globalScope.LINUXDOTREE_ROUTING = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : window);

