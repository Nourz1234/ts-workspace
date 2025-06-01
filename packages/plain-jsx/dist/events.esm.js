const AddEvents = ['mounted', 'ready', 'rendered'];
const RemoveEvents = ['unmounted'];
const nodeEventMap = new WeakMap();
const observer = new MutationObserver(onDOMUpdated);
let isInitialized = false;
function initialize() {
    if (isInitialized) {
        return;
    }
    isInitialized = true;
    observer.observe(document.body, { childList: true, subtree: true });
}
function register(node, priority, event, handler) {
    let handlers = nodeEventMap.get(node);
    if (!handlers) {
        handlers = createLifecycleEventHandlers(priority);
        nodeEventMap.set(node, handlers);
    }
    handlers[event].add(handler);
    return {
        unregister: () => handlers[event].delete(handler),
    };
}
function registerIndirect(node, handlers) {
    let existingHandlers = nodeEventMap.get(node);
    if (!existingHandlers) {
        existingHandlers = createLifecycleEventHandlers(handlers.priority);
        nodeEventMap.set(node, existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, [
        'mounted',
        'unmounted',
        'ready',
        'rendered',
    ]);
}
function onMounted(node, priority, handler) {
    return register(node, priority, 'mounted', handler);
}
function onUnmounted(node, priority, handler) {
    return register(node, priority, 'unmounted', handler);
}
function onReady(node, priority, handler) {
    return register(node, priority, 'ready', handler);
}
function onRendered(node, priority, handler) {
    return register(node, priority, 'rendered', handler);
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
    let existingHandlers = handlersList.find(handlers => handlers.priority === handlers.priority);
    if (!existingHandlers) {
        existingHandlers = createLifecycleEventHandlers(handlers.priority);
        handlersList.push(existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, events);
}
function onDOMUpdated(mutations) {
    const handlersList = [];
    for (const mutation of mutations) {
        for (const addedNode of iterNodeList(mutation.addedNodes)) {
            const handlers = nodeEventMap.get(addedNode);
            if (handlers) {
                mergeEventHandlersGroupedByPriority(handlersList, handlers, AddEvents);
            }
        }
        for (const removedNode of iterNodeList(mutation.removedNodes)) {
            const handlers = nodeEventMap.get(removedNode);
            if (handlers) {
                mergeEventHandlersGroupedByPriority(handlersList, handlers, RemoveEvents);
            }
        }
    }
    handlersList.sort(x => x.priority);
    void dispatchEvents(handlersList);
}
async function dispatchEvents(handlersList) {
    for (const handlers of handlersList) {
        await Promise.all([...handlers.mounted, ...handlers.unmounted]
            .map((handler) => handler()));
    }
    setTimeout(async () => {
        for (const handlers of handlersList) {
            await Promise.all([...handlers.ready].map((handler) => handler()));
        }
    }, 0);
    requestAnimationFrame(() => {
        // can potentially handle onRender (before render) here!
        void Promise.resolve().then(async () => {
            for (const handlers of handlersList) {
                await Promise.all([...handlers.rendered].map((handler) => handler()));
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
const LifecycleEventManager = {
    initialize,
    register,
    registerIndirect,
    onMounted,
    onUnmounted,
    onReady,
    onRendered,
    createLifecycleEventHandlers,
};

export { LifecycleEventManager };
