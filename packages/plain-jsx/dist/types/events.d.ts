import type { Action } from '@lib/utils';
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
declare function initialize(): void;
declare function register(target: EventTarget, priority: number, event: EventName, handler: EventHandler): Registration;
declare function setLogicalParent(target: EventTarget, component: Component): void;
declare function onMounted(target: EventTarget, priority: number, handler: EventHandler): Registration;
declare function onUnmounted(target: EventTarget, priority: number, handler: EventHandler): Registration;
declare function onReady(target: EventTarget, priority: number, handler: EventHandler): Registration;
declare function onRendered(target: EventTarget, priority: number, handler: EventHandler): Registration;
declare function createLifecycleEventHandlers(priority: number): LifecycleEventHandlers;
export declare const LifecycleEventsManager: {
    initialize: typeof initialize;
    register: typeof register;
    setLogicalParent: typeof setLogicalParent;
    onMounted: typeof onMounted;
    onUnmounted: typeof onUnmounted;
    onReady: typeof onReady;
    onRendered: typeof onRendered;
    createLifecycleEventHandlers: typeof createLifecycleEventHandlers;
};
export {};
