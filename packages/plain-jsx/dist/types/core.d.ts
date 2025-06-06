import type { ShowProps } from './reactive';
import { Show } from './reactive';
import type { DOMProps, FunctionalComponent, PropsType, SVGProps, VNode, VNodeChildren } from './types';
export declare const Fragment = "Fragment";
export declare function createVNode(type: string | FunctionalComponent, props?: PropsType, children?: VNode | VNode[]): VNode;
export declare function jsx(type: string | FunctionalComponent, props: {
    children?: VNodeChildren;
}): VNode;
export { jsx as jsxDEV, jsx as jsxs };
export declare function createElement(tag: string | FunctionalComponent, props?: PropsType, ...children: VNode[]): VNode;
export declare function render(root: Element | DocumentFragment, vNode: VNode): Promise<void>;
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
        [Show]: ShowProps;
    }
}
