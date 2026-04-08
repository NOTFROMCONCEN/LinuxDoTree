(async function () {
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

    const TOPIC_CATEGORY_MAP_KEY = "topicCategoryMap";
    const CATEGORY_MODE_MAP_KEY = "categoryModeMap";
    const NAVIGATION_STATE_KEY = "linuxdotreeNavigationState";
    const STYLE_ID = "linuxdotree-style";
    const BOOST_HELPER_ID = "linuxdotree-boost-helper";
    const FLOATING_PANEL_ID = "linuxdotree-floating-panel";

    const extensionApi =
        typeof chrome !== "undefined"
            ? chrome
            : typeof browser !== "undefined"
                ? browser
                : null;

    const syncStorage = extensionApi && extensionApi.storage ? extensionApi.storage.sync : null;
    const localStorageArea = extensionApi && extensionApi.storage ? extensionApi.storage.local : null;

    let currentSettings = await loadSettings();
    let lastHref = window.location.href;
    let enhancementTimerId = null;
    let pageRefreshTimerId = null;
    let scrollResetTimerId = null;
    let lastHandledTopicKey = "";
    let titleSyncTimerId = null;
    let lastReplyContextPost = null;
    let currentPostRecords = null;

    function isContextInvalidatedError(error) {
        const message = String(
            (error && typeof error === "object" && "message" in error && error.message) || error || ""
        );
        return /Extension context invalidated/i.test(message);
    }

    function isExtensionContextAlive() {
        try {
            return Boolean(extensionApi && extensionApi.runtime && extensionApi.runtime.id);
        } catch (error) {
            return false;
        }
    }

    function getStorage(area, defaults) {
        return new Promise((resolve) => {
            if (!area || !isExtensionContextAlive()) {
                resolve(defaults || {});
                return;
            }

            try {
                area.get(defaults || null, (items) => {
                    const runtimeError =
                        extensionApi && extensionApi.runtime ? extensionApi.runtime.lastError : null;

                    if (runtimeError) {
                        resolve(defaults || {});
                        return;
                    }

                    resolve(items || {});
                });
            } catch (error) {
                if (isContextInvalidatedError(error)) {
                    resolve(defaults || {});
                    return;
                }

                resolve(defaults || {});
            }
        });
    }

    function setStorage(area, value) {
        return new Promise((resolve) => {
            if (!area || !isExtensionContextAlive()) {
                resolve();
                return;
            }

            try {
                area.set(value, () => {
                    resolve();
                });
            } catch (error) {
                resolve();
            }
        });
    }

    async function loadSettings() {
        if (!syncStorage) {
            return { ...DEFAULT_SETTINGS };
        }

        const items = await getStorage(syncStorage, null);
        return {
            ...DEFAULT_SETTINGS,
            ...items,
            defaultSortMode: normalizeSortMode(items.defaultSortMode, items.forceOldSort),
            enableParentChainHighlight: false,
            optimizeBoosts: false,
            recommendBoostForShortReplies: false
        };
    }

    function normalizeSortMode(mode, legacyForceOldSort) {
        if (mode === "top" || mode === "new" || mode === "old" || mode === "default") {
            return mode;
        }

        return legacyForceOldSort ? "old" : "default";
    }

    function normalizeCategoryToken(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/^\/c\//, "")
            .replace(/\/+$/, "");
    }

    function parseCategoryWhitelist(rawValue) {
        return String(rawValue || "")
            .split(/\r?\n|,/)
            .map((item) => normalizeCategoryToken(item))
            .filter(Boolean);
    }

    function getTopicIdFromPath(pathname) {
        const match = pathname.match(/\/(?:t|nested)\/(?:[^/]+\/)?(\d+)(?:\/\d+)?\/?$/);
        return match ? match[1] : null;
    }

    function isLinuxDoUrl(url) {
        return /^(?:www\.)?linux\.do$/i.test(url.hostname);
    }

    function getNestedUrl(originalUrl, settings) {
        try {
            const isRelative = originalUrl.startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);

            if (!isLinuxDoUrl(url) || !url.pathname.startsWith("/t/")) {
                return originalUrl;
            }

            let newPath = url.pathname;

            if (/^\/t\/[^/]+\/\d+(?:\/\d+)?\/?$/.test(newPath)) {
                newPath = newPath.replace(
                    /^\/t\/([^/]+)\/(\d+)(?:\/\d+)?\/?$/,
                    "/nested/$1/$2"
                );
            } else if (/^\/t\/\d+(?:\/\d+)?\/?$/.test(newPath)) {
                newPath = newPath.replace(/^\/t\/(\d+)(?:\/\d+)?\/?$/, "/nested/$1");
            } else {
                newPath = newPath.replace(/^\/t\//, "/nested/");
            }

            url.pathname = newPath;

            const defaultSortMode = normalizeSortMode(settings.defaultSortMode, settings.forceOldSort);
            if (defaultSortMode !== "default" && !url.searchParams.has("sort")) {
                url.searchParams.set("sort", defaultSortMode);
            }

            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch (error) {
            console.error("linuxdotree URL parse error:", error);
            return originalUrl;
        }
    }

    function getFlatUrl(originalUrl) {
        try {
            const isRelative = originalUrl.startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);

            if (!isLinuxDoUrl(url) || !url.pathname.startsWith("/nested/")) {
                return originalUrl;
            }

            url.pathname = url.pathname.replace(/^\/nested\//, "/t/");
            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch (error) {
            console.error("linuxdotree flat URL parse error:", error);
            return originalUrl;
        }
    }

    function setSortModeOnUrl(originalUrl, sortMode) {
        try {
            const isRelative = originalUrl.startsWith("/");
            const baseUrl = isRelative ? window.location.origin : undefined;
            const url = new URL(originalUrl, baseUrl);
            const normalized = normalizeSortMode(sortMode, false);

            if (normalized === "default") {
                url.searchParams.delete("sort");
            } else {
                url.searchParams.set("sort", normalized);
            }

            return isRelative ? url.pathname + url.search + url.hash : url.href;
        } catch (error) {
            return originalUrl;
        }
    }

    function getCurrentSortMode() {
        try {
            const url = new URL(window.location.href);
            return normalizeSortMode(url.searchParams.get("sort"), false);
        } catch (error) {
            return "default";
        }
    }

    function shouldSkipFlatLink(anchor, settings) {
        if (!settings.allowFlatView) {
            return false;
        }

        const text = (anchor.textContent || "").trim().toLowerCase();
        return text.includes("view as flat");
    }

    function isTopicLink(href) {
        return /^\/t\//.test(href) || /^https?:\/\/linux\.do\/t\//.test(href);
    }

    async function getCategoryState() {
        const values = await getStorage(localStorageArea, {
            [TOPIC_CATEGORY_MAP_KEY]: {},
            [CATEGORY_MODE_MAP_KEY]: {},
            [NAVIGATION_STATE_KEY]: null
        });

        return {
            topicCategoryMap: values[TOPIC_CATEGORY_MAP_KEY] || {},
            categoryModeMap: values[CATEGORY_MODE_MAP_KEY] || {},
            navigationState: values[NAVIGATION_STATE_KEY] || null
        };
    }

    async function saveCategoryForCurrentTopic(category) {
        const topicId = getTopicIdFromPath(window.location.pathname);
        if (!topicId || !category) {
            return;
        }

        const { topicCategoryMap } = await getCategoryState();
        const nextMap = { ...topicCategoryMap, [topicId]: category };
        await setStorage(localStorageArea, { [TOPIC_CATEGORY_MAP_KEY]: nextMap });
    }

    async function saveModePreference(mode, category) {
        if (currentSettings.rememberModePreference) {
            currentSettings.preferredMode = mode;
            await setStorage(syncStorage, { preferredMode: mode });
        }

        if (category) {
            const { categoryModeMap } = await getCategoryState();
            const nextModeMap = { ...categoryModeMap, [category]: mode };
            await setStorage(localStorageArea, { [CATEGORY_MODE_MAP_KEY]: nextModeMap });
        }
    }

    function detectCurrentCategory() {
        const candidates = Array.from(
            document.querySelectorAll(
                "a.badge-wrapper[href*='/c/'], .topic-category a[href*='/c/'], .category-name[href*='/c/'], a[href*='/c/']"
            )
        );

        for (const anchor of candidates) {
            const href = anchor.getAttribute("href") || "";
            const match = href.match(/\/c\/([^/?#]+)/i);
            if (!match) {
                continue;
            }

            const slug = normalizeCategoryToken(match[1]);
            const label = normalizeCategoryToken(anchor.textContent);

            if (slug) {
                return slug || label;
            }
        }

        return "";
    }

    function getCurrentTopicTitle() {
        const selectors = [
            ".fancy-title .title",
            ".topic-title h1",
            "h1[data-topic-id]",
            "h1",
            ".title-wrapper h1",
            ".topic-area h1"
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);
            const text = element && element.textContent ? element.textContent.trim() : "";
            if (text) {
                return text;
            }
        }

        return "";
    }

    function syncDocumentTitle() {
        window.clearTimeout(titleSyncTimerId);
        titleSyncTimerId = window.setTimeout(() => {
            const topicTitle = getCurrentTopicTitle();
            if (!topicTitle) {
                return;
            }

            const nextTitle = `${topicTitle} - LINUX DO`;
            if (document.title !== nextTitle) {
                document.title = nextTitle;
            }
        }, 80);
    }

    function isCategoryAllowed(settings, category) {
        const whitelist = parseCategoryWhitelist(settings.categoryWhitelist);
        if (!whitelist.length) {
            return true;
        }

        if (!category) {
            return false;
        }

        return whitelist.includes(normalizeCategoryToken(category));
    }

    async function resolveModePreference(category) {
        if (!currentSettings.rememberModePreference) {
            return "nested";
        }

        const { categoryModeMap } = await getCategoryState();
        if (category && categoryModeMap[category]) {
            return categoryModeMap[category];
        }

        return currentSettings.preferredMode || "nested";
    }

    async function maybeRedirectOnLoad() {
        const topicId = getTopicIdFromPath(window.location.pathname);
        const { topicCategoryMap } = await getCategoryState();
        const cachedCategory = topicId ? topicCategoryMap[topicId] : "";
        const preferredMode = await resolveModePreference(cachedCategory);

        if (
            currentSettings.autoRedirect &&
            preferredMode === "nested" &&
            window.location.pathname.startsWith("/t/") &&
            isCategoryAllowed(currentSettings, cachedCategory)
        ) {
            const targetUrl = getNestedUrl(window.location.href, currentSettings);
            if (targetUrl !== window.location.href) {
                window.location.replace(targetUrl);
                return true;
            }
        }

        if (
            currentSettings.rememberModePreference &&
            preferredMode === "flat" &&
            window.location.pathname.startsWith("/nested/")
        ) {
            const targetUrl = getFlatUrl(window.location.href);
            if (targetUrl !== window.location.href) {
                window.location.replace(targetUrl);
                return true;
            }
        }

        return false;
    }

    function ensureBaseStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            #${BOOST_HELPER_ID} {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin-left: 12px;
                padding: 0;
                border: 0;
                background: transparent;
                flex-wrap: nowrap;
                vertical-align: middle;
                width: auto;
                min-width: 0;
                max-width: 100%;
                flex: 0 0 auto;
                align-self: center;
            }

            #${BOOST_HELPER_ID}[hidden] {
                display: none;
            }

            #${BOOST_HELPER_ID} .linuxdotree-boost-helper-copy {
                color: #5f6f88;
                font-size: 12px;
                line-height: 1.45;
                flex: 0 1 auto;
                white-space: nowrap;
            }

            #${BOOST_HELPER_ID} .linuxdotree-boost-helper-actions {
                display: inline-flex;
                gap: 6px;
                flex-wrap: nowrap;
                flex: 0 0 auto;
            }

            #${BOOST_HELPER_ID} .linuxdotree-boost-helper-btn {
                border: 1px solid rgba(122, 136, 163, 0.16);
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.88);
                color: #5e6f89;
                padding: 4px 10px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                line-height: 1.2;
            }

            .linuxdotree-post {
                position: relative;
                transition: box-shadow 140ms ease, background-color 140ms ease;
                border-radius: 14px;
                overflow: visible;
                box-shadow: inset 0 0 0 1px transparent;
            }

            .linuxdotree-post.linuxdotree-post-highlight {
                background: linear-gradient(180deg, rgba(239, 243, 249, 0.58), rgba(248, 250, 252, 0.42));
                box-shadow:
                    inset 3px 0 0 rgba(126, 141, 166, 0.58),
                    inset 0 0 0 1px rgba(126, 141, 166, 0.14);
            }

            .linuxdotree-avatar-target {
                transition: box-shadow 140ms ease, transform 140ms ease;
                border-radius: 999px;
            }

            .linuxdotree-post.linuxdotree-post-highlight .linuxdotree-avatar-target {
                box-shadow: 0 0 0 2px rgba(126, 141, 166, 0.28);
            }

            .linuxdotree-fold-button {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 3;
                width: 24px;
                height: 24px;
                border: 1px solid rgba(126, 141, 166, 0.24);
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.9);
                color: #586883;
                font-size: 14px;
                line-height: 1;
                cursor: pointer;
                box-shadow: 0 8px 20px rgba(29, 39, 57, 0.08);
            }

            .linuxdotree-post.linuxdotree-post-collapsed::after {
                content: attr(data-linuxdotree-hidden-count) " 条回复已折叠";
                display: block;
                margin: 8px 0 0 14px;
                color: #738199;
                font-size: 12px;
            }

            .linuxdotree-post.linuxdotree-hidden-branch {
                display: none !important;
            }

            .linuxdotree-boost-block {
                position: relative;
                margin: 10px 0 8px;
                padding: 10px 12px 8px;
                border-radius: 16px;
                border: 1px solid rgba(122, 136, 163, 0.12);
                background: linear-gradient(180deg, rgba(248, 250, 252, 0.88), rgba(243, 246, 250, 0.78));
                overflow: hidden;
            }

            .linuxdotree-boost-block.linuxdotree-boost-collapsed {
                max-height: 72px;
            }

            .linuxdotree-boost-block.linuxdotree-boost-collapsed::after {
                content: "";
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                height: 32px;
                background: linear-gradient(180deg, rgba(243, 246, 250, 0), rgba(243, 246, 250, 0.98));
                pointer-events: none;
            }

            .linuxdotree-boost-toggle {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin: 6px 0 10px;
                padding: 6px 10px;
                border: 1px solid rgba(122, 136, 163, 0.16);
                border-radius: 999px;
                background: rgba(255, 255, 255, 0.86);
                color: #61718d;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
            }

            .linuxdotree-boost-muted {
                opacity: 0.88;
            }

            .linuxdotree-boost-hidden {
                display: none !important;
            }

            .linuxdotree-boost-target {
                box-shadow: 0 0 0 2px rgba(126, 141, 166, 0.18) inset, 0 10px 20px rgba(32, 44, 62, 0.08);
                border-radius: 12px;
            }

            #${FLOATING_PANEL_ID} {
                position: fixed;
                left: 18px;
                bottom: 18px;
                z-index: 2147483640;
                width: 238px;
                padding: 14px;
                border-radius: 20px;
                border: 1px solid rgba(126, 141, 166, 0.18);
                background: rgba(255, 255, 255, 0.9);
                box-shadow: 0 18px 42px rgba(28, 38, 56, 0.12);
                backdrop-filter: blur(18px);
                color: #243246;
            }

            #${FLOATING_PANEL_ID}[hidden] {
                display: none;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-label {
                font-size: 11px;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: #7a889b;
                font-weight: 700;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-current {
                font-size: 13px;
                color: #54647d;
                font-weight: 600;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                margin-bottom: 12px;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-btn {
                border: 1px solid rgba(126, 141, 166, 0.16);
                border-radius: 14px;
                background: rgba(248, 250, 252, 0.92);
                color: #5a6a83;
                min-height: 38px;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-btn.is-active {
                background: linear-gradient(135deg, rgba(113, 130, 157, 0.96), rgba(148, 163, 186, 0.96));
                color: white;
                box-shadow: 0 10px 24px rgba(97, 112, 138, 0.2);
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-sort {
                display: grid;
                gap: 6px;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-sort label {
                font-size: 12px;
                color: #73829a;
                font-weight: 600;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-select {
                width: 100%;
                border: 1px solid rgba(126, 141, 166, 0.16);
                border-radius: 14px;
                padding: 9px 12px;
                background: rgba(248, 250, 252, 0.92);
                color: #465771;
                font: inherit;
            }

            @media (max-width: 640px) {
                #${FLOATING_PANEL_ID} {
                    left: 12px;
                    right: 12px;
                    bottom: 12px;
                    width: auto;
                }
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-fold-row {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 6px;
                margin-top: 8px;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-fold-row[hidden] {
                display: none;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-action-btn {
                border: 1px solid rgba(126, 141, 166, 0.16);
                border-radius: 12px;
                background: rgba(248, 250, 252, 0.92);
                color: #5a6a83;
                padding: 7px 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: center;
            }

            #${FLOATING_PANEL_ID} .linuxdotree-floating-copy-btn {
                display: block;
                width: 100%;
                border: 1px solid rgba(126, 141, 166, 0.16);
                border-radius: 12px;
                background: rgba(248, 250, 252, 0.92);
                color: #5a6a83;
                padding: 7px 10px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                text-align: center;
                margin-top: 8px;
                box-sizing: border-box;
            }
        `;

        document.documentElement.appendChild(style);
    }

    function getPostElements() {
        return Array.from(
            document.querySelectorAll(
                ".topic-post, article[data-post-id], [data-post-id].boxed, .topic-post.clearfix"
            )
        ).filter((element) => element instanceof HTMLElement);
    }

    function getBoostContainers() {
        const candidates = Array.from(
            document.querySelectorAll(
                "div.discourse-boosts__post-menu, .discourse-boosts__post-menu, [class*='discourse-boosts__post-menu'], [class*='discourse-boosts']"
            )
        ).filter((element) => element instanceof HTMLElement);

        return candidates.filter((element) => {
            return !candidates.some((other) => other !== element && other.contains(element));
        });
    }

    function analyzeBoostContainer(container) {
        const classText = String(container.className || "");
        const text = container.textContent.trim();
        const avatarCount = container.querySelectorAll(":scope img, :scope .avatar, :scope [class*='avatar']").length;
        const pillCount = container.querySelectorAll(":scope button, :scope a, :scope [role='button']").length;
        const boostWordHit = /boost/i.test(classText) || /boost/i.test(text);
        const hasVisibleContent = text.length > 0 || avatarCount > 0 || pillCount > 0;
        const isLikelyBoost = boostWordHit || avatarCount >= 2 || pillCount >= 3;
        const needsClamp =
            container.scrollHeight > 84 ||
            container.childElementCount >= 2 ||
            text.length > 90 ||
            avatarCount >= 4 ||
            pillCount >= 5;

        return {
            hasVisibleContent,
            isLikelyBoost,
            needsClamp
        };
    }

    function getBoostActionButton() {
        const selector = [
            "button[title*='boost' i]",
            "button[aria-label*='boost' i]",
            "button[title*='火箭' i]",
            "button[aria-label*='火箭' i]",
            "[class*='boost'] button",
            ".discourse-boost button",
            ".d-icon-rocket",
            "svg.d-icon-rocket",
            "use[href*='rocket']"
        ].join(", ");

        const scoped = lastReplyContextPost ? lastReplyContextPost.querySelector(selector) : null;

        const target = scoped || document.querySelector(selector);

        return target && target.closest ? target.closest("button") || target : target;
    }

    function revealReplyContextActions() {
        if (!(lastReplyContextPost instanceof HTMLElement)) {
            return;
        }

        ["mouseenter", "mouseover", "mousemove"].forEach((type) => {
            lastReplyContextPost.dispatchEvent(
                new MouseEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        });

        const actionBar = lastReplyContextPost.querySelector(
            ".post-controls, .topic-post-controls, .actions, .regular.contents, article"
        );

        if (actionBar instanceof HTMLElement) {
            actionBar.dispatchEvent(
                new MouseEvent("mousemove", {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
            );
        }
    }

    async function openBoostComposerFromReply(textarea) {
        revealReplyContextActions();

        let boostButton = getBoostActionButton();
        if (!(boostButton instanceof HTMLElement)) {
            await new Promise((resolve) => window.setTimeout(resolve, 80));
            revealReplyContextActions();
            boostButton = getBoostActionButton();
        }

        if (!(boostButton instanceof HTMLElement)) {
            return false;
        }

        boostButton.click();

        for (const delay of [120, 260, 420]) {
            await new Promise((resolve) => window.setTimeout(resolve, delay));
            const boostInput = getBoostInputField();
            if (
                boostInput instanceof HTMLInputElement ||
                boostInput instanceof HTMLTextAreaElement
            ) {
                if (!boostInput.value) {
                    boostInput.value = textarea.value;
                    boostInput.dispatchEvent(new Event("input", { bubbles: true }));
                }
                boostInput.focus();
                return true;
            }
        }

        return true;
    }

    function getBoostInputField() {
        return document.querySelector(
            ".discourse-boost input, .discourse-boost textarea, [class*='boost'] input[maxlength], [class*='boost'] textarea[maxlength], input[maxlength='20'], textarea[maxlength='20']"
        );
    }

    function decorateBoosts() {
        const boostContainers = getBoostContainers();

        boostContainers.forEach((container) => {
            if (!(container instanceof HTMLElement)) {
                return;
            }

            const analysis = analyzeBoostContainer(container);

            let toggle = container.nextElementSibling;
            if (!(toggle instanceof HTMLElement) || !toggle.classList.contains("linuxdotree-boost-toggle")) {
                toggle = null;
            }

            container.classList.remove(
                "linuxdotree-boost-block",
                "linuxdotree-boost-muted",
                "linuxdotree-boost-collapsed",
                "linuxdotree-boost-hidden"
            );

            if (!currentSettings.optimizeBoosts) {
                if (toggle) {
                    toggle.remove();
                }
                return;
            }

            if (!analysis.hasVisibleContent || !analysis.isLikelyBoost) {
                container.classList.add("linuxdotree-boost-hidden");
                if (toggle) {
                    toggle.remove();
                }
                return;
            }

            container.classList.add("linuxdotree-boost-block", "linuxdotree-boost-muted");

            if (!analysis.needsClamp) {
                container.dataset.linuxdotreeExpanded = "0";
                if (toggle) {
                    toggle.remove();
                }
                return;
            }

            const expanded = container.dataset.linuxdotreeExpanded === "1";
            container.classList.toggle("linuxdotree-boost-collapsed", !expanded);

            if (!toggle) {
                toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "linuxdotree-boost-toggle";
                container.insertAdjacentElement("afterend", toggle);
            }

            const refreshToggle = () => {
                const expanded = !container.classList.contains("linuxdotree-boost-collapsed");
                toggle.textContent = expanded ? "收起 Boost" : "展开 Boost";
            };

            toggle.onclick = () => {
                const expanded = container.classList.contains("linuxdotree-boost-collapsed");
                container.classList.toggle("linuxdotree-boost-collapsed", !expanded);
                container.dataset.linuxdotreeExpanded = expanded ? "1" : "0";
                refreshToggle();
            };

            refreshToggle();
        });
    }

    function countReplyLength(value) {
        return Array.from(String(value || "").trim()).length;
    }

    function getComposerTextarea() {
        return document.querySelector(
            "textarea.d-editor-input, .reply-area textarea, .composer-fields textarea, textarea"
        );
    }

    function getComposerHintContainer(textarea) {
        if (!(textarea instanceof HTMLElement)) {
            return null;
        }

        return (
            textarea.closest(".reply-area, .d-editor, .composer-fields, .composer-popup") ||
            textarea.parentElement
        );
    }

    function getComposerActionRow(host) {
        if (!(host instanceof HTMLElement)) {
            return null;
        }

        return host.querySelector(
            ".save-or-cancel, .submit-panel .save-or-cancel, .reply-control, .composer-controls"
        );
    }

    function getComposerPrimaryAction(actionRow) {
        if (!(actionRow instanceof HTMLElement)) {
            return null;
        }

        return actionRow.querySelector(
            "button.btn-primary, .btn-primary, button.create, .create, button.reply, .reply"
        );
    }

    function updateBoostRecommendation() {
        const textarea = getComposerTextarea();
        const boostAction = getBoostActionButton();

        if (!(textarea instanceof HTMLTextAreaElement) || !currentSettings.recommendBoostForShortReplies) {
            const helper = document.getElementById(BOOST_HELPER_ID);
            if (helper) {
                helper.remove();
            }
            if (boostAction instanceof HTMLElement) {
                boostAction.classList.remove("linuxdotree-boost-target");
            }
            return;
        }

        const host = getComposerHintContainer(textarea);
        if (!(host instanceof HTMLElement)) {
            return;
        }

        const replyActions = getComposerActionRow(host);
        const primaryAction = getComposerPrimaryAction(replyActions);
        let helper = document.getElementById(BOOST_HELPER_ID);
        if (!helper) {
            helper = document.createElement("span");
            helper.id = BOOST_HELPER_ID;
            helper.innerHTML = `
                <span class="linuxdotree-boost-helper-copy"></span>
                <span class="linuxdotree-boost-helper-actions">
                    <button type="button" class="linuxdotree-boost-helper-btn" data-action="open-boost">切换到 Boost</button>
                </span>
            `;
            if (primaryAction instanceof HTMLElement) {
                primaryAction.insertAdjacentElement("afterend", helper);
            } else if (replyActions instanceof HTMLElement) {
                replyActions.appendChild(helper);
            } else {
                host.appendChild(helper);
            }
        }

        if (primaryAction instanceof HTMLElement && helper.previousElementSibling !== primaryAction) {
            primaryAction.insertAdjacentElement("afterend", helper);
        } else if (!(primaryAction instanceof HTMLElement) && replyActions instanceof HTMLElement && helper.parentElement !== replyActions) {
            replyActions.appendChild(helper);
        }

        const length = countReplyLength(textarea.value);
        const shouldRecommend = length > 0 && length < 20;
        const helperCopy = helper.querySelector(".linuxdotree-boost-helper-copy");

        if (!shouldRecommend) {
            helper.hidden = true;
            if (boostAction instanceof HTMLElement) {
                boostAction.classList.remove("linuxdotree-boost-target");
            }
            return;
        }

        helper.hidden = false;
        if (helperCopy) {
            helperCopy.innerHTML = `<strong>${length}/20 字</strong>，更适合 Boost`;
        }

        if (boostAction instanceof HTMLElement) {
            boostAction.classList.add("linuxdotree-boost-target");
        }
    }

    function bindComposerRecommendation() {
        const textarea = getComposerTextarea();
        if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.linuxdotreeBoostBound === "1") {
            updateBoostRecommendation();
            return;
        }

        textarea.dataset.linuxdotreeBoostBound = "1";
        textarea.addEventListener("input", updateBoostRecommendation);
        textarea.addEventListener("focus", updateBoostRecommendation);
        textarea.addEventListener("compositionstart", () => {
            textarea.dataset.linuxdotreeComposing = "1";
        });
        textarea.addEventListener("compositionend", () => {
            textarea.dataset.linuxdotreeComposing = "0";
            updateBoostRecommendation();
        });

        const host = getComposerHintContainer(textarea);
        if (host instanceof HTMLElement && !host.dataset.linuxdotreeBoostHelperBound) {
            host.dataset.linuxdotreeBoostHelperBound = "1";
            host.addEventListener("click", async (event) => {
                const actionButton = event.target instanceof Element
                    ? event.target.closest(`#${BOOST_HELPER_ID} [data-action]`)
                    : null;
                if (!actionButton) {
                    return;
                }

                const action = actionButton.getAttribute("data-action");
                if (action === "open-boost") {
                    event.preventDefault();
                    event.stopPropagation();
                    await openBoostComposerFromReply(textarea);
                }
            });
        }

        updateBoostRecommendation();
    }

    function getCurrentTopicKey() {
        const topicId = getTopicIdFromPath(window.location.pathname);
        if (!topicId) {
            return "";
        }

        const mode = window.location.pathname.startsWith("/nested/") ? "nested" : "flat";
        return `${mode}:${topicId}`;
    }

    async function markPendingNavigation(targetMode) {
        const topicId = getTopicIdFromPath(window.location.pathname);
        if (!topicId) {
            return;
        }

        await setStorage(localStorageArea, {
            [NAVIGATION_STATE_KEY]: {
                topicId,
                targetMode,
                createdAt: Date.now()
            }
        });
    }

    function getFloatingPanel() {
        let panel = document.getElementById(FLOATING_PANEL_ID);
        if (panel instanceof HTMLElement) {
            return panel;
        }

        panel = document.createElement("section");
        panel.id = FLOATING_PANEL_ID;
        panel.innerHTML = `
            <div class="linuxdotree-floating-head">
                <span class="linuxdotree-floating-label">linuxdotree</span>
                <span class="linuxdotree-floating-current"></span>
            </div>
            <div class="linuxdotree-floating-grid">
                <button type="button" class="linuxdotree-floating-btn" data-mode="nested">树形</button>
                <button type="button" class="linuxdotree-floating-btn" data-mode="flat">平铺</button>
            </div>
            <div class="linuxdotree-floating-sort">
                <label for="linuxdotree-floating-sort-select">排序模式</label>
                <select id="linuxdotree-floating-sort-select" class="linuxdotree-floating-select" data-role="sort-select">
                    <option value="default">跟随站点默认</option>
                    <option value="top">Top</option>
                    <option value="new">New</option>
                    <option value="old">Old</option>
                </select>
            </div>
            <div class="linuxdotree-floating-fold-row" data-role="fold-row" hidden>
                <button type="button" class="linuxdotree-floating-action-btn" data-action="fold-all">全部折叠</button>
                <button type="button" class="linuxdotree-floating-action-btn" data-action="expand-all">全部展开</button>
            </div>
            <button type="button" class="linuxdotree-floating-copy-btn" data-action="copy-link">复制树形链接</button>
        `;

        panel.addEventListener("click", async (event) => {
            const modeButton = event.target instanceof Element
                ? event.target.closest(".linuxdotree-floating-btn[data-mode]")
                : null;
            const actionButton = event.target instanceof Element
                ? event.target.closest("[data-action]")
                : null;

            if (!modeButton && !actionButton) {
                return;
            }

            if (modeButton) {
                event.preventDefault();
                const nextMode = modeButton.getAttribute("data-mode");
                const category = detectCurrentCategory();
                await saveModePreference(nextMode, category);

                if (nextMode === "nested" && window.location.pathname.startsWith("/t/")) {
                    await markPendingNavigation("nested");
                    window.location.replace(getNestedUrl(window.location.href, currentSettings));
                    return;
                }

                if (nextMode === "nested" && window.location.pathname.startsWith("/nested/")) {
                    renderFloatingPanel();
                    return;
                }

                if (nextMode === "flat" && window.location.pathname.startsWith("/nested/")) {
                    window.location.replace(getFlatUrl(window.location.href));
                    return;
                }

                if (nextMode === "flat" && window.location.pathname.startsWith("/t/")) {
                    renderFloatingPanel();
                }
                return;
            }

            if (actionButton) {
                event.preventDefault();
                const action = actionButton.getAttribute("data-action");

                if (action === "fold-all") {
                    foldAllBranches(true);
                    return;
                }

                if (action === "expand-all") {
                    foldAllBranches(false);
                    return;
                }

                if (action === "copy-link") {
                    const nestedUrl = getNestedUrl(window.location.href, currentSettings);
                    await copyToClipboard(nestedUrl);
                    const prev = actionButton.textContent;
                    actionButton.textContent = "已复制！";
                    window.setTimeout(() => {
                        actionButton.textContent = prev;
                    }, 1500);
                }
            }
        });

        panel.addEventListener("change", async (event) => {
            const select = event.target instanceof HTMLSelectElement &&
                event.target.matches("[data-role='sort-select']")
                ? event.target
                : null;

            if (!select) {
                return;
            }

            currentSettings.defaultSortMode = normalizeSortMode(select.value, false);
            await setStorage(syncStorage, { defaultSortMode: currentSettings.defaultSortMode });

            const nextUrl = setSortModeOnUrl(window.location.href, currentSettings.defaultSortMode);
            if (nextUrl !== window.location.href) {
                window.location.replace(nextUrl);
            }
        });

        document.documentElement.appendChild(panel);
        return panel;
    }

    function renderFloatingPanel() {
        const isTopicPage =
            window.location.pathname.startsWith("/t/") || window.location.pathname.startsWith("/nested/");
        const panel = document.getElementById(FLOATING_PANEL_ID);

        const extensionEnabled = Boolean(currentSettings.autoRedirect || currentSettings.interceptLinks);
        if (!extensionEnabled || !currentSettings.enableFloatingToggle || !isTopicPage) {
            if (panel) {
                panel.remove();
            }
            return;
        }

        const nextPanel = getFloatingPanel();
        const mode = window.location.pathname.startsWith("/nested/") ? "nested" : "flat";
        const currentLabel = nextPanel.querySelector(".linuxdotree-floating-current");
        const sortSelect = nextPanel.querySelector("[data-role='sort-select']");

        nextPanel.querySelectorAll(".linuxdotree-floating-btn[data-mode]").forEach((button) => {
            const active = button.getAttribute("data-mode") === mode;
            button.classList.toggle("is-active", active);
        });

        if (currentLabel) {
            currentLabel.textContent = mode === "nested" ? "当前：树形" : "当前：平铺";
        }

        if (sortSelect instanceof HTMLSelectElement) {
            sortSelect.value = getCurrentSortMode();
        }

        const foldRow = nextPanel.querySelector("[data-role='fold-row']");
        if (foldRow instanceof HTMLElement) {
            foldRow.hidden = !(mode === "nested" && currentSettings.enableReplyFolding);
        }

        nextPanel.hidden = false;
    }

    async function maybeResetScrollPosition() {
        if (!window.location.pathname.startsWith("/nested/")) {
            return;
        }

        const topicId = getTopicIdFromPath(window.location.pathname);
        if (!topicId) {
            return;
        }

        const currentTopicKey = getCurrentTopicKey();
        if (lastHandledTopicKey === currentTopicKey) {
            return;
        }

        const { navigationState } = await getCategoryState();
        const shouldReset =
            navigationState &&
            navigationState.topicId === topicId &&
            navigationState.targetMode === "nested" &&
            Date.now() - Number(navigationState.createdAt || 0) < 12000;

        if (!shouldReset) {
            return;
        }

        lastHandledTopicKey = currentTopicKey;

        window.clearTimeout(scrollResetTimerId);
        scrollResetTimerId = window.setTimeout(() => {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            window.setTimeout(() => {
                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            }, 120);
        }, 80);

        await setStorage(localStorageArea, { [NAVIGATION_STATE_KEY]: null });
    }

    function computePostTree(posts) {
        const records = posts.map((element, index) => {
            const rect = element.getBoundingClientRect();
            return {
                element,
                index,
                depth: Math.round(rect.left),
                children: [],
                parentIndex: null,
                hiddenCount: 0
            };
        });

        const stack = [];
        for (const record of records) {
            while (stack.length && stack[stack.length - 1].depth >= record.depth) {
                stack.pop();
            }

            if (stack.length) {
                record.parentIndex = stack[stack.length - 1].index;
                stack[stack.length - 1].children.push(record.index);
            }

            stack.push(record);
        }

        return records;
    }

    function clearHighlights() {
        getPostElements().forEach((element) => {
            element.classList.remove("linuxdotree-post-highlight");
        });
    }

    function highlightChain(records, index) {
        clearHighlights();

        let cursor = index;
        while (cursor !== null && records[cursor]) {
            records[cursor].element.classList.add("linuxdotree-post-highlight");
            cursor = records[cursor].parentIndex;
        }
    }

    function hideBranch(records, rootIndex, hidden) {
        const stack = [...records[rootIndex].children];
        let count = 0;

        while (stack.length) {
            const currentIndex = stack.pop();
            const record = records[currentIndex];
            if (!record) {
                continue;
            }

            record.element.classList.toggle("linuxdotree-hidden-branch", hidden);
            count += 1;

            for (const childIndex of record.children) {
                stack.push(childIndex);
            }
        }

        records[rootIndex].hiddenCount = count;
        records[rootIndex].element.dataset.linuxdotreeHiddenCount = String(count);
        records[rootIndex].element.classList.toggle("linuxdotree-post-collapsed", hidden && count > 0);
    }

    function decoratePosts(records) {
        records.forEach((record) => {
            record.element.classList.add("linuxdotree-post");
            const avatar = record.element.querySelector(
                ".topic-avatar img, .topic-avatar .avatar, .avatar img, img.avatar, .topic-avatar"
            );
            if (avatar instanceof HTMLElement) {
                avatar.classList.add("linuxdotree-avatar-target");
            }

            record.element.onmouseenter = () => {
                if (currentSettings.enableParentChainHighlight) {
                    highlightChain(records, record.index);
                }
            };

            record.element.onmouseleave = () => {
                if (currentSettings.enableParentChainHighlight) {
                    clearHighlights();
                }
            };

            let button = record.element.querySelector(".linuxdotree-fold-button");
            if (!record.children.length || !currentSettings.enableReplyFolding) {
                if (button) {
                    button.remove();
                }
                return;
            }

            if (!button) {
                button = document.createElement("button");
                button.type = "button";
                button.className = "linuxdotree-fold-button";
                record.element.appendChild(button);
            }

            const refreshButton = () => {
                const collapsed = record.element.classList.contains("linuxdotree-post-collapsed");
                button.textContent = collapsed ? "+" : "−";
                button.title = collapsed ? "展开回复分支" : "折叠回复分支";
            };

            button.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();

                const collapsed = record.element.classList.contains("linuxdotree-post-collapsed");
                hideBranch(records, record.index, !collapsed);
                refreshButton();
            };

            refreshButton();
        });
    }

    function foldAllBranches(collapse) {
        if (!currentPostRecords) {
            return;
        }

        if (collapse) {
            currentPostRecords.forEach((record) => {
                if (record.children.length > 0 && record.parentIndex === null) {
                    hideBranch(currentPostRecords, record.index, true);
                }
            });
        } else {
            currentPostRecords.forEach((record) => {
                if (record.children.length > 0) {
                    hideBranch(currentPostRecords, record.index, false);
                }
            });
        }

        currentPostRecords.forEach((record) => {
            const btn = record.element.querySelector(".linuxdotree-fold-button");
            if (!btn) {
                return;
            }
            const collapsed = record.element.classList.contains("linuxdotree-post-collapsed");
            btn.textContent = collapsed ? "+" : "−";
            btn.title = collapsed ? "展开回复分支" : "折叠回复分支";
        });
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const el = document.createElement("textarea");
            el.value = text;
            el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            el.remove();
        }
    }

    function scheduleThreadEnhancements() {
        const shouldEnhance =
            window.location.pathname.startsWith("/nested/") &&
            (currentSettings.enableReplyFolding || currentSettings.enableParentChainHighlight);

        if (!shouldEnhance) {
            currentPostRecords = null;
            clearHighlights();
            getPostElements().forEach((element) => {
                const button = element.querySelector(".linuxdotree-fold-button");
                if (button) {
                    button.remove();
                }
            });
            return;
        }

        window.clearTimeout(enhancementTimerId);
        enhancementTimerId = window.setTimeout(() => {
            const posts = getPostElements();
            if (posts.length < 2) {
                return;
            }

            const records = computePostTree(posts);
            currentPostRecords = records;
            decoratePosts(records);
        }, 180);
    }

    async function refreshPageFeatures() {
        const category = detectCurrentCategory();
        if (category) {
            await saveCategoryForCurrentTopic(category);
        }

        ensureBaseStyles();
        renderFloatingPanel();
        scheduleThreadEnhancements();
        decorateBoosts();
        bindComposerRecommendation();
        syncDocumentTitle();
        await maybeResetScrollPosition();
    }

    function schedulePageRefresh() {
        window.clearTimeout(pageRefreshTimerId);
        pageRefreshTimerId = window.setTimeout(() => {
            void refreshPageFeatures();
        }, 120);
    }

    function handleStorageChange(changes, areaName) {
        if (areaName !== "sync") {
            return;
        }

        currentSettings = {
            ...currentSettings,
            ...Object.fromEntries(
                Object.entries(changes).map(([key, value]) => [key, value.newValue])
            )
        };

        const enabled = Boolean(currentSettings.autoRedirect || currentSettings.interceptLinks);
        if (!enabled && window.location.pathname.startsWith("/nested/")) {
            window.location.replace(getFlatUrl(window.location.href));
            return;
        }

        void refreshPageFeatures();
    }

    function installRouteWatcher() {
        const emitChange = () => {
            window.dispatchEvent(new Event("linuxdotree:route-change"));
        };

        const wrapHistoryMethod = (methodName) => {
            const original = history[methodName];
            history[methodName] = function (...args) {
                const result = original.apply(this, args);
                emitChange();
                return result;
            };
        };

        wrapHistoryMethod("pushState");
        wrapHistoryMethod("replaceState");

        window.addEventListener("popstate", emitChange);
        window.addEventListener("linuxdotree:route-change", async () => {
            if (window.location.href === lastHref) {
                return;
            }

            lastHref = window.location.href;
            schedulePageRefresh();
        });

        window.setInterval(async () => {
            if (window.location.href === lastHref) {
                return;
            }

            lastHref = window.location.href;
            schedulePageRefresh();
        }, 600);
    }

    if (await maybeRedirectOnLoad()) {
        return;
    }

    installRouteWatcher();

    if (syncStorage && extensionApi.storage && extensionApi.storage.onChanged) {
        extensionApi.storage.onChanged.addListener(handleStorageChange);
    }

    window.addEventListener(
        "click",
        async (event) => {
            const anchor = event.target instanceof Element ? event.target.closest("a") : null;
            const replyTrigger = event.target instanceof Element
                ? event.target.closest("button, a")
                : null;

            if (replyTrigger) {
                const text = (replyTrigger.textContent || "").trim().toLowerCase();
                const label =
                    (replyTrigger.getAttribute("aria-label") || replyTrigger.getAttribute("title") || "").toLowerCase();
                if (text.includes("回复") || label.includes("reply")) {
                    const postElement = replyTrigger.closest(
                        ".topic-post, article[data-post-id], [data-post-id].boxed, .topic-post.clearfix"
                    );
                    if (postElement instanceof HTMLElement) {
                        lastReplyContextPost = postElement;
                    }
                }
            }

            if (!anchor) {
                return;
            }

            if (shouldSkipFlatLink(anchor, currentSettings)) {
                if (currentSettings.rememberModePreference) {
                    const category = detectCurrentCategory();
                    await saveModePreference("flat", category);
                }
                return;
            }

            const href = anchor.getAttribute("href");
            if (!href || !isTopicLink(href)) {
                return;
            }

            const category = detectCurrentCategory();
            const nextHref = getNestedUrl(href, currentSettings);

            if (
                currentSettings.interceptLinks &&
                isCategoryAllowed(currentSettings, category) &&
                (!currentSettings.rememberModePreference || (await resolveModePreference(category)) === "nested")
            ) {
                if (nextHref !== href) {
                    anchor.setAttribute("href", nextHref);
                }

                await markPendingNavigation("nested");
            }
        },
        true
    );

    function isOwnMutation(mutations) {
        return mutations.every((m) => {
            const target = m.target;
            return (
                target instanceof Element &&
                Boolean(
                    target.closest(
                        `#${BOOST_HELPER_ID}, #${FLOATING_PANEL_ID}, [class*="linuxdotree-"]`
                    )
                )
            );
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            void refreshPageFeatures();
            new MutationObserver((mutations) => {
                if (!isOwnMutation(mutations)) {
                    schedulePageRefresh();
                }
            }).observe(document.body, { childList: true, subtree: true });
        });
    } else {
        void refreshPageFeatures();
        new MutationObserver((mutations) => {
            if (!isOwnMutation(mutations)) {
                schedulePageRefresh();
            }
        }).observe(document.body, { childList: true, subtree: true });
    }
})().catch((error) => {
    const message = String(
        (error && typeof error === "object" && "message" in error && error.message) || error || ""
    );
    if (/Extension context invalidated/i.test(message)) {
        return;
    }

    console.error("linuxdotree init failed:", error);
});
