import type { Action, MaybePromise } from '@lib/utils';
import type { Component, EventHandler } from './types';

type EventName = 'mounted' | 'unmounted' | 'ready' | 'rendered';
type EventHandlerMap = Record<EventName, Set<EventHandler>>;
type EventTarget = Node | Component;

export interface LifecycleEventHandlers extends EventHandlerMap {
    priority: number;
}

export interface Registration {
    unregister: Action;
}

const AddEvents: EventName[] = ['mounted', 'ready', 'rendered'];
const RemoveEvents: EventName[] = ['unmounted'];

const targetMap = new WeakMap<EventTarget, LifecycleEventHandlers>();
const targetParentMap = new WeakMap<EventTarget, Component>();

const observer = new MutationObserver(onDOMUpdated);
let isInitialized = false;

function initialize() {
    if (isInitialized) {
        return;
    }
    isInitialized = true;
    observer.observe(document.body, { childList: true, subtree: true });
}

function register(
    target: EventTarget,
    priority: number,
    event: EventName,
    handler: EventHandler,
): Registration {
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

function setLogicalParent(target: EventTarget, component: Component) {
    targetParentMap.set(target, component);
}

function onMounted(target: EventTarget, priority: number, handler: EventHandler) {
    return register(target, priority, 'mounted', handler);
}

function onUnmounted(target: EventTarget, priority: number, handler: EventHandler) {
    return register(target, priority, 'unmounted', handler);
}

function onReady(target: EventTarget, priority: number, handler: EventHandler) {
    return register(target, priority, 'ready', handler);
}

function onRendered(target: EventTarget, priority: number, handler: EventHandler) {
    return register(target, priority, 'rendered', handler);
}

function createLifecycleEventHandlers(priority: number): LifecycleEventHandlers {
    return {
        priority,
        mounted: new Set(),
        ready: new Set(),
        rendered: new Set(),
        unmounted: new Set(),
    };
}

function mergeEventHandlers(
    handlers: LifecycleEventHandlers,
    other: LifecycleEventHandlers,
    events: EventName[],
) {
    for (const event of events) {
        handlers[event] = handlers[event].union(other[event]);
    }
}

function mergeEventHandlersGroupedByPriority(
    handlersList: LifecycleEventHandlers[],
    handlers: LifecycleEventHandlers,
    events: EventName[],
) {
    let existingHandlers = handlersList.find(existingHandlers =>
        existingHandlers.priority === handlers.priority
    );
    if (!existingHandlers) {
        existingHandlers = createLifecycleEventHandlers(handlers.priority);
        handlersList.push(existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, events);
}

function onDOMUpdated(mutations: MutationRecord[]) {
    const nodesMap = new Map<Node, { mountCount: number }>();
    const getMeta = (node: Node) => {
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

    const handlersList: LifecycleEventHandlers[] = [];
    const handleEventTarget = (target: EventTarget, events: EventName[]) => {
        const handlers = targetMap.get(target);
        if (!handlers) {
            return;
        }
        mergeEventHandlersGroupedByPriority(handlersList, handlers, events);
    };

    for (const [node, meta] of nodesMap.entries()) {
        let events: EventName[];
        let handleAtCount: number;
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

async function dispatchEvents(handlersList: LifecycleEventHandlers[]) {
    for (const handlers of handlersList) {
        await Promise.allSettled(
            [...handlers.mounted, ...handlers.unmounted]
                .map((handler): MaybePromise<void> => handler()),
        ).catch(console.error);
    }
    setTimeout(async () => {
        for (const handlers of handlersList) {
            await Promise.allSettled(
                [...handlers.ready].map((handler): MaybePromise<void> => handler()),
            );
        }
    }, 0);
    requestAnimationFrame(() => {
        // can potentially handle onRender (before render) here!
        void Promise.resolve().then(async () => {
            for (const handlers of handlersList) {
                await Promise.allSettled(
                    [...handlers.rendered].map((handler): MaybePromise<void> => handler()),
                );
            }
        });
    });
}

function* iterNodeDescendants(node: Node) {
    const walker = document.createNodeIterator(node, NodeFilter.SHOW_ALL);
    let current: Node | null;

    while ((current = walker.nextNode())) {
        yield current;
    }
}

function* iterNodeList(nodes: NodeList) {
    for (const node of nodes) {
        for (const subNode of iterNodeDescendants(node)) {
            yield subNode;
        }
    }
}

export const LifecycleEventsManager = {
    initialize,
    register,
    setLogicalParent,
    onMounted,
    onUnmounted,
    onReady,
    onRendered,
    createLifecycleEventHandlers,
};
