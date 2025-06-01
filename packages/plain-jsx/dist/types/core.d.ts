import type { DOMProps, EventHandler, FunctionalComponent, PropsType, SVGProps, VNode, VNodeChildren } from './types';
export declare const Fragment = "Fragment";
export declare function createVNode(type: string | FunctionalComponent, props?: PropsType, children?: VNode[], isDev?: boolean): VNode;
export declare function jsx(type: string | FunctionalComponent, props: {
    children?: VNodeChildren;
}): VNode;
export { jsx as jsxs };
export declare function jsxDEV(type: string | FunctionalComponent, props: {
    children?: VNodeChildren;
}): VNode;
export declare function createElement(tag: string | FunctionalComponent, props?: PropsType, ...children: VNode[]): VNode;
export declare function render(root: Element | DocumentFragment, element: VNode, handlers?: {
    onMounted: EventHandler;
}): Promise<void>;
type DOMElement = Element;
export declare namespace JSX {
    type PropsOf<T extends DOMElement> = T extends SVGElement ? SVGProps<T> : DOMProps<T>;
    type Fragment = typeof Fragment;
    type Element = VNode;
    type BaseIntrinsicElements = {
        [K in keyof HTMLElementTagNameMap]: PropsOf<HTMLElementTagNameMap[K]>;
    } & {
        [K in keyof SVGElementTagNameMap as `svg:${K}`]: PropsOf<SVGElementTagNameMap[K]>;
    };
    interface IntrinsicElements extends BaseIntrinsicElements {
    }
}
