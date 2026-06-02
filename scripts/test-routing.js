const assert = require("node:assert/strict");
const path = require("node:path");

global.window = {
    location: {
        origin: "https://linux.do"
    }
};

global.LINUXDOTREE_SHARED = {
    normalizeSortMode(mode, legacyForceOldSort) {
        if (mode === "top" || mode === "new" || mode === "old" || mode === "default") {
            return mode;
        }
        return legacyForceOldSort ? "old" : "default";
    }
};

require(path.join(__dirname, "..", "src", "common", "routing.js"));

const routing = global.LINUXDOTREE_ROUTING;
const settings = { defaultSortMode: "old" };

assert.equal(routing.getTopicIdFromPath("/t/topic/1986094"), "1986094");
assert.equal(routing.getTopicIdFromPath("/n/topic/1986094/7"), "1986094");
assert.equal(routing.isTreePath("/n/topic/1986094"), true);
assert.equal(routing.isTreePath("/nested/topic/1986094"), true);
assert.equal(routing.isTreePath("/t/topic/1986094"), false);
assert.equal(routing.isTopicLink("/t/topic/1986094"), true);
assert.equal(routing.isTopicLink("https://linux.do/n/topic/1986094"), true);

assert.equal(
    routing.getNestedUrl("https://linux.do/t/topic/1986094?sort=new", settings),
    "https://linux.do/n/topic/1986094?sort=old"
);
assert.equal(
    routing.getNestedUrl("https://linux.do/t/topic/1986094/7#reply", settings),
    "https://linux.do/n/topic/1986094?sort=old#reply"
);
assert.equal(
    routing.getNestedUrl("/nested/topic/1986094/7?sort=top", { defaultSortMode: "default" }),
    "/n/topic/1986094"
);
assert.equal(
    routing.getFlatUrl("https://linux.do/n/topic/1986094?sort=old"),
    "https://linux.do/t/topic/1986094?sort=old"
);
assert.equal(
    routing.setSortModeOnUrl("https://linux.do/n/topic/1986094?sort=new", "top"),
    "https://linux.do/n/topic/1986094?sort=top"
);
assert.equal(
    routing.setSortModeOnUrl("https://linux.do/n/topic/1986094?sort=new", "default"),
    "https://linux.do/n/topic/1986094"
);

console.log("routing tests passed");
