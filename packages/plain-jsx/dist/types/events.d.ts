import type { Action } from '@lib/utils';
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
declare function initialize(): void;
declare function register(node: Node, target: object, priority: number, event: EventName, handler: EventHandler): Registration;
declare function registerIndirect(node: Node, target: object, handlers: LifecycleEventHandlers): void;
declare function onMounted(node: Node, target: object, priority: number, handler: EventHandler): Registration;
declare function onUnmounted(node: Node, target: object, priority: number, handler: EventHandler): Registration;
declare function onReady(node: Node, target: object, priority: number, handler: EventHandler): Registration;
declare function onRendered(node: Node, target: object, priority: number, handler: EventHandler): Registration;
declare function createLifecycleEventHandlers(priority: number): LifecycleEventHandlers;
export declare const LifecycleEventsManager: {
    initialize: typeof initialize;
    register: typeof register;
    registerIndirect: typeof registerIndirect;
    onMounted: typeof onMounted;
    onUnmounted: typeof onUnmounted;
    onReady: typeof onReady;
    onRendered: typeof onRendered;
    createLifecycleEventHandlers: typeof createLifecycleEventHandlers;
};
export {};
