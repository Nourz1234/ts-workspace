import type { Action } from '@lib/utils';
import type { EventHandler } from './types';
export interface Registration {
    unregister: Action;
}
export declare class LifecycleEvents {
    private readonly handlersMap;
    private static readonly AddEvents;
    private static readonly RemoveEvents;
    constructor();
    private domUpdated;
    private static mergeHandlers;
    private static handleChanges;
    private register;
    onMounted(node: Node, level: number, handler: EventHandler): Registration;
    onUnmounted(node: Node, level: number, handler: EventHandler): Registration;
    onReady(node: Node, level: number, handler: EventHandler): Registration;
    onRendered(node: Node, level: number, handler: EventHandler): Registration;
}
