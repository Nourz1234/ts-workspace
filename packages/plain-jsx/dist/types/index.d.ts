import type { Observable } from './observable';
import type { ComponentEvents, Helpers, VNode, VNodeChildren } from './types';
export { createElement, createElement as h, Fragment, JSX, render } from './core';
export { createObservable, createRef } from './observable';
export { For, Show, With } from './reactive';
export type FunctionalComponent<TProps = object, TRef = unknown> = (props: TProps & {
    ref?: Observable<TRef | null>;
}, events: ComponentEvents, helpers: Helpers<TRef>) => VNode;
/** To be extended for components with children */
export interface ParentComponent {
    children?: VNodeChildren;
}
