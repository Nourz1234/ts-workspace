class LifecycleEvents {
    handlersMap = new WeakMap();
    static AddEvents = ['mounted', 'ready', 'rendered'];
    static RemoveEvents = ['unmounted'];
    constructor() {
        const observer = new MutationObserver(this.domUpdated.bind(this));
        observer.observe(document.body, { childList: true, subtree: true });
    }
    domUpdated(mutations) {
        const handlersList = [];
        for (const mutation of mutations) {
            for (const addedNode of iterNodeList(mutation.addedNodes)) {
                const nodeHandlers = this.handlersMap.get(addedNode);
                if (nodeHandlers) {
                    LifecycleEvents.mergeHandlers(handlersList, nodeHandlers, LifecycleEvents.AddEvents);
                }
            }
            for (const removedNode of iterNodeList(mutation.removedNodes)) {
                const nodeHandlers = this.handlersMap.get(removedNode);
                if (nodeHandlers) {
                    LifecycleEvents.mergeHandlers(handlersList, nodeHandlers, LifecycleEvents.RemoveEvents);
                }
            }
        }
        void LifecycleEvents.handleChanges(handlersList);
    }
    static mergeHandlers(handlersList, nodeHandlers, events) {
        let existingHandlers = handlersList.find(handlers => handlers.level === nodeHandlers.level);
        if (!existingHandlers) {
            existingHandlers = {
                level: nodeHandlers.level,
                mounted: new Set(),
                ready: new Set(),
                rendered: new Set(),
                unmounted: new Set(),
            };
            handlersList.push(existingHandlers);
        }
        for (const event of events) {
            existingHandlers[event] = existingHandlers[event].union(nodeHandlers[event]);
        }
    }
    static async handleChanges(handlersList) {
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
    register(node, level, event, handler) {
        let nodeHandlers = this.handlersMap.get(node);
        if (!nodeHandlers) {
            nodeHandlers = {
                level,
                mounted: new Set(),
                ready: new Set(),
                rendered: new Set(),
                unmounted: new Set(),
            };
            this.handlersMap.set(node, nodeHandlers);
        }
        nodeHandlers[event].add(handler);
        return {
            unregister: () => nodeHandlers[event].delete(handler),
        };
    }
    onMounted(node, level, handler) {
        return this.register(node, level, 'mounted', handler);
    }
    onUnmounted(node, level, handler) {
        return this.register(node, level, 'unmounted', handler);
    }
    onReady(node, level, handler) {
        return this.register(node, level, 'ready', handler);
    }
    onRendered(node, level, handler) {
        return this.register(node, level, 'rendered', handler);
    }
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

export { LifecycleEvents };
