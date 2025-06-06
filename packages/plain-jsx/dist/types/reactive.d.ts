import { Observable } from './observable';
import type { PropsType, RNode, VNode, VNodeChildren } from './types';
export declare class ReactiveNode {
    private readonly placeholder;
    private children;
    constructor();
    update(rNode: RNode): void;
    getRoot(): ChildNode[];
}
export type CustomRenderFn = (props: PropsType, children: VNodeChildren, renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>) => Promise<RNode>;
export interface ShowProps {
    when: Observable<boolean>;
    /**
     * - `true`: (default) Cache the children on the first show and re-use each time they are shown.
     * - `false`: No caching, children get rendered each time they are shown.
     */
    cache?: boolean;
    children: VNodeChildren | (() => VNode);
}
export declare const Show = "Show";
export declare function renderShow(props: PropsType, children: VNodeChildren, renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>): Promise<RNode>;
export interface WithProps<T> {
    value: Observable<T>;
    children: (value: T) => VNode;
}
export declare function With<T>(props: WithProps<T>): VNode;
export declare function renderWith(props: PropsType, children: VNodeChildren, renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>): Promise<RNode>;
export interface ForProps<T> extends PropsType {
    of: Observable<T[]>;
    children: (item: T, index: number) => VNode;
}
export declare function For<T>(props: ForProps<T>): VNode;
export declare function renderFor(props: PropsType, children: VNodeChildren, renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>): Promise<RNode>;
