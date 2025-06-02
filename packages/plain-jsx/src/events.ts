import type { Action, MaybePromise } from '@lib/utils';
import type { EventHandler } from './types';

type EventName = 'mounted' | 'unmounted' | 'ready' | 'rendered';
type EventHandlerMap = Record<EventName, Set<EventHandler>>;

export type LifecycleEventHandlers = {
    priority: number;
} & EventHandlerMap;

export type TargetEventHandlers = {
    target: WeakRef<object> | null;
    mounts: number;
} & LifecycleEventHandlers;

export interface Registration {
    unregister: Action;
}

const AddEvents: EventName[] = ['mounted', 'ready', 'rendered'];
const RemoveEvents: EventName[] = ['unmounted'];
const nodeEventMap = new WeakMap<Node, TargetEventHandlers>();

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
    node: Node,
    target: object,
    priority: number,
    event: EventName,
    handler: EventHandler,
): Registration {
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

function registerIndirect(node: Node, target: object, handlers: LifecycleEventHandlers) {
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

function onMounted(node: Node, target: object, priority: number, handler: EventHandler) {
    return register(node, target, priority, 'mounted', handler);
}

function onUnmounted(node: Node, target: object, priority: number, handler: EventHandler) {
    return register(node, target, priority, 'unmounted', handler);
}

function onReady(node: Node, target: object, priority: number, handler: EventHandler) {
    return register(node, target, priority, 'ready', handler);
}

function onRendered(node: Node, target: object, priority: number, handler: EventHandler) {
    return register(node, target, priority, 'rendered', handler);
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

function createTargetEventHandlers(target: object, priority: number): TargetEventHandlers {
    const handlers = createLifecycleEventHandlers(priority);
    return {
        target: new WeakRef(target),
        mounts: 0,
        ...handlers,
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
    let existingHandlers = handlersList.find(handlers => handlers.priority === handlers.priority);
    if (!existingHandlers) {
        existingHandlers = createLifecycleEventHandlers(handlers.priority);
        handlersList.push(existingHandlers);
    }
    mergeEventHandlers(existingHandlers, handlers, events);
}

function onDOMUpdated(mutations: MutationRecord[]) {
    const handlersList: LifecycleEventHandlers[] = [];
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
            mergeEventHandlersGroupedByPriority(
                handlersList,
                handlers,
                AddEvents,
            );
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
            mergeEventHandlersGroupedByPriority(
                handlersList,
                handlers,
                RemoveEvents,
            );
        }
    }
    handlersList.sort(x => x.priority);
    void dispatchEvents(handlersList);
}

async function dispatchEvents(handlersList: LifecycleEventHandlers[]) {
    for (const handlers of handlersList) {
        await Promise.all(
            [...handlers.mounted, ...handlers.unmounted]
                .map((handler): MaybePromise<void> => handler()),
        );
    }
    setTimeout(async () => {
        for (const handlers of handlersList) {
            await Promise.all(
                [...handlers.ready].map((handler): MaybePromise<void> => handler()),
            );
        }
    }, 0);
    requestAnimationFrame(() => {
        // can potentially handle onRender (before render) here!
        void Promise.resolve().then(async () => {
            for (const handlers of handlersList) {
                await Promise.all(
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
    registerIndirect,
    onMounted,
    onUnmounted,
    onReady,
    onRendered,
    createLifecycleEventHandlers,
};
