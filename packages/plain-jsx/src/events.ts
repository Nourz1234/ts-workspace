import type { Action, MaybePromise } from '@lib/utils';
import type { EventHandler } from './types';

type EventName = 'mounted' | 'unmounted' | 'ready' | 'rendered';
type EventHandlerMap = Record<EventName, Set<EventHandler>>;
type EventHandlers = {
    level: number;
} & EventHandlerMap;

export interface Registration {
    unregister: Action;
}

export class LifecycleEvents {
    private readonly handlersMap = new WeakMap<Node, EventHandlers>();
    private static readonly AddEvents: EventName[] = ['mounted', 'ready', 'rendered'];
    private static readonly RemoveEvents: EventName[] = ['unmounted'];

    public constructor() {
        const observer = new MutationObserver(this.domUpdated.bind(this));
        observer.observe(document.body, { childList: true, subtree: true });
    }

    private domUpdated(mutations: MutationRecord[]) {
        const handlersList: EventHandlers[] = [];
        for (const mutation of mutations) {
            for (const addedNode of iterNodeList(mutation.addedNodes)) {
                const nodeHandlers = this.handlersMap.get(addedNode);
                if (nodeHandlers) {
                    LifecycleEvents.mergeHandlers(
                        handlersList,
                        nodeHandlers,
                        LifecycleEvents.AddEvents,
                    );
                }
            }
            for (const removedNode of iterNodeList(mutation.removedNodes)) {
                const nodeHandlers = this.handlersMap.get(removedNode);
                if (nodeHandlers) {
                    LifecycleEvents.mergeHandlers(
                        handlersList,
                        nodeHandlers,
                        LifecycleEvents.RemoveEvents,
                    );
                }
            }
        }
        void LifecycleEvents.handleChanges(handlersList);
    }

    private static mergeHandlers(
        handlersList: EventHandlers[],
        nodeHandlers: EventHandlers,
        events: EventName[],
    ) {
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

    private static async handleChanges(handlersList: EventHandlers[]) {
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

    private register(
        node: Node,
        level: number,
        event: EventName,
        handler: EventHandler,
    ): Registration {
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

    public onMounted(node: Node, level: number, handler: EventHandler) {
        return this.register(node, level, 'mounted', handler);
    }

    public onUnmounted(node: Node, level: number, handler: EventHandler) {
        return this.register(node, level, 'unmounted', handler);
    }

    public onReady(node: Node, level: number, handler: EventHandler) {
        return this.register(node, level, 'ready', handler);
    }

    public onRendered(node: Node, level: number, handler: EventHandler) {
        return this.register(node, level, 'rendered', handler);
    }
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
