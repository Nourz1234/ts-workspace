const AddEvents = ['mounted', 'ready', 'rendered'];
const RemoveEvents = ['unmounted'];
const targetMap = new WeakMap();
const targetParentMap = new WeakMap();
const observer = new MutationObserver(onDOMUpdated);
let isInitialized = false;
function initialize() {
    if (isInitialized) {
        return;
    }
    isInitialized = true;
    observer.observe(document.body, { childList: true, subtree: true });
}
function register(target, priority, event, handler) {
    let handlers = targetMap.get(target);
    if (!handlers) {
        handlers = createLifecycleEventHandlers(priority);
        targetMap.set(target, handlers);
    }
    handlers[event].add(handler);
    return {
        unregister: () => handlers[event].delete(handler),
    };
}
function setLogicalParent(target, component) {
    targetParentMap.set(target, component);
}
function onMounted(target, priority, handler) {
    return register(target, priority, 'mounted', handler);
}
function onUnmounted(target, priority, handler) {
    return register(target, priority, 'unmounted', handler);
}
function onReady(target, priority, handler) {
    return register(target, priority, 'ready', handler);
}
function onRendered(target, priority, handler) {
    return register(target, priority, 'rendered', handler);
}
function createLifecycleEventHandlers(priority) {
    return {
        priority,
        mounted: new Set(),
        ready: new Set(),
        rendered: new Set(),
        unmounted: new Set(),
    };
}
function mergeEventHandlers(handlers, other, events) {
    for (const event of events) {
        handlers[event] = handlers[event].union(other[event]);
    }
}
function mergeEventHandlersGroupedByPriority(handlersList, handlers, events) {
    let existingHandlers = handlersList.find(existingHandlers => existingHandlers.priority === handlers.priority);
    if (!existingHandlers) {
        existingHandlers = createLifecycleEventHandlers(handlers.priority);
        handlersList.push(existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, events);
}
function onDOMUpdated(mutations) {
    const nodesMap = new Map();
    const getMeta = (node) => {
        let meta = nodesMap.get(node);
        if (!meta) {
            meta = { mountCount: 0 };
            nodesMap.set(node, meta);
        }
        return meta;
    };
    for (const mutation of mutations) {
        for (const addedNode of iterNodeList(mutation.addedNodes)) {
            const meta = getMeta(addedNode);
            meta.mountCount++;
        }
        for (const removedNode of iterNodeList(mutation.removedNodes)) {
            const meta = getMeta(removedNode);
            meta.mountCount--;
        }
    }
    const handlersList = [];
    const handleEventTarget = (target, events) => {
        const handlers = targetMap.get(target);
        if (!handlers) {
            return;
        }
        mergeEventHandlersGroupedByPriority(handlersList, handlers, events);
    };
    for (const [node, meta] of nodesMap.entries()) {
        let events;
        let handleAtCount;
        if (meta.mountCount > 0) {
            events = AddEvents;
            handleAtCount = 1;
        }
        else if (meta.mountCount < 0) {
            events = RemoveEvents;
            handleAtCount = 0;
        }
        else {
            continue;
        }
        let parent = targetParentMap.get(node);
        while (parent) {
            parent.mountedChildCount += meta.mountCount;
            if (parent.mountedChildCount === handleAtCount) {
                handleEventTarget(parent, events);
            }
            parent = targetParentMap.get(parent);
        }
        handleEventTarget(node, events);
    }
    handlersList.sort((a, b) => b.priority - a.priority);
    void dispatchEvents(handlersList);
}
async function dispatchEvents(handlersList) {
    for (const handlers of handlersList) {
        await Promise.allSettled([...handlers.mounted, ...handlers.unmounted]
            .map((handler) => handler())).catch(console.error);
    }
    setTimeout(async () => {
        for (const handlers of handlersList) {
            await Promise.allSettled([...handlers.ready].map((handler) => handler()));
        }
    }, 0);
    requestAnimationFrame(() => {
        // can potentially handle onRender (before render) here!
        void Promise.resolve().then(async () => {
            for (const handlers of handlersList) {
                await Promise.allSettled([...handlers.rendered].map((handler) => handler()));
            }
        });
    });
}
function* iterNodeDescendants(node) {
    const walker = document.createNodeIterator(node, NodeFilter.SHOW_ALL);
    let current;
    while ((current = walker.nextNode())) {
        yield current;
    }
}
function* iterNodeList(nodes) {
    for (const node of nodes) {
        for (const subNode of iterNodeDescendants(node)) {
            yield subNode;
        }
    }
}
const LifecycleEventsManager = {
    initialize,
    register,
    setLogicalParent,
    onMounted,
    onUnmounted,
    onReady,
    onRendered,
    createLifecycleEventHandlers,
};

export { LifecycleEventsManager };
