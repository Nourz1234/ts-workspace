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
function register(node, target, priority, event, handler) {
    let handlers = nodeEventMap.get(node);
    if (!handlers) {
        handlers = createTargetEventHandlers(target, priority);
        nodeEventMap.set(node, handlers);
    }
    handlers[event].add(handler);
    return {
        unregister: () => handlers[event].delete(handler),
    };
}
function registerIndirect(node, target, handlers) {
    let existingHandlers = nodeEventMap.get(node);
    if (!existingHandlers) {
        existingHandlers = createTargetEventHandlers(target, handlers.priority);
        nodeEventMap.set(node, existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, [
        'mounted',
        'unmounted',
        'ready',
        'rendered',
    ]);
}
function onMounted(node, target, priority, handler) {
    return register(node, target, priority, 'mounted', handler);
}
function onUnmounted(node, target, priority, handler) {
    return register(node, target, priority, 'unmounted', handler);
}
function onReady(node, target, priority, handler) {
    return register(node, target, priority, 'ready', handler);
}
function onRendered(node, target, priority, handler) {
    return register(node, target, priority, 'rendered', handler);
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
function createTargetEventHandlers(target, priority) {
    const handlers = createLifecycleEventHandlers(priority);
    return {
        target: new WeakRef(target),
        mounts: 0,
        ...handlers,
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
            if (!handlers) {
                continue;
            }
            if (handlers.mounts === 0) {
                continue;
            }
            ++handlers.mounts;
            mergeEventHandlersGroupedByPriority(handlersList, handlers, AddEvents);
        }
        for (const removedNode of iterNodeList(mutation.removedNodes)) {
            const handlers = nodeEventMap.get(removedNode);
            if (!handlers) {
                continue;
            }
            --handlers.mounts;
            if (handlers.mounts !== 0) {
                continue;
            }
            mergeEventHandlersGroupedByPriority(handlersList, handlers, RemoveEvents);
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
const LifecycleEventsManager = {
    initialize,
    register,
    registerIndirect,
    onMounted,
    onUnmounted,
    onReady,
    onRendered,
    createLifecycleEventHandlers,
};

export { LifecycleEventsManager };
