import type { MaybePromise } from '@lib/utils';
import { hasKey } from '@lib/utils';
import { LifecycleEventsManager } from './events';
import type { Subscription } from './observable';
import { Observable } from './observable';
import type { CustomRenderFn, ShowProps } from './reactive';
import { For, renderFor, renderShow, renderWith, Show, With } from './reactive';
import { ReactiveNode } from './reactive';
import { _Sentinel } from './sintenel';
import type {
    Component,
    ComponentEvents,
    DOMProps,
    ErrorCapturedHandler,
    FunctionalComponent,
    PropsType,
    RNode,
    SetupHandler,
    SVGProps,
    VNode,
    VNodeChildren,
} from './types';

const XMLNamespaces = {
    'svg': 'http://www.w3.org/2000/svg' as const,
};

export const Fragment = 'Fragment';

/* built-in components that have special handling */
const BuiltinComponents = new Map<unknown, CustomRenderFn>(
    [
        [Show, renderShow],
        [With, renderWith],
        [For, renderFor],
    ],
);

export function createVNode(
    type: string | FunctionalComponent,
    props?: PropsType,
    children?: VNode | VNode[],
): VNode {
    return { type, props: props ?? {}, children };
}

export function jsx(
    type: string | FunctionalComponent,
    props: { children?: VNodeChildren },
): VNode {
    const { children } = props;
    delete props.children;
    return createVNode(type, props, children);
}

export { jsx as jsxDEV, jsx as jsxs };

export function createElement(
    tag: string | FunctionalComponent,
    props?: PropsType,
    ...children: VNode[]
): VNode {
    return createVNode(tag, props, children);
}

export async function render(root: Element | DocumentFragment, vNode: VNode) {
    LifecycleEventsManager.initialize();
    const rNode = await renderVNode(vNode, 1);
    if (rNode === null) {
        return;
    }

    if (Array.isArray(rNode)) {
        root.append(...rNode);
    }
    else {
        root.appendChild(rNode);
    }
}

async function renderVNode(
    vNode: VNode,
    level: number,
    parent?: Component | ParentNode,
): Promise<RNode> {
    if (vNode === undefined || vNode === null || typeof vNode === 'boolean') {
        return null;
    }
    else if (typeof vNode === 'string' || typeof vNode === 'number') {
        return document.createTextNode(String(vNode));
    }
    else if (vNode instanceof Observable) {
        const reactiveNode = new ReactiveNode();
        reactiveNode.update(await renderVNodes(vNode.value, level, parent));

        if (parent) {
            let subscription: Subscription | null = null;
            LifecycleEventsManager.onMounted(parent, level, () => {
                subscription = vNode.subscribe(async (value) => {
                    reactiveNode.update(await renderVNodes(value, level, parent));
                });
            });
            LifecycleEventsManager.onUnmounted(parent, level, () => {
                subscription?.unsubscribe();
                subscription = null;
            });
        }
        return reactiveNode.getRoot();
    }

    const { type, props, children } = vNode;

    const renderBuiltin = BuiltinComponents.get(type);
    if (renderBuiltin) {
        return await renderBuiltin(
            props,
            children,
            async (vNodes: VNode | VNode[]) => renderVNodes(vNodes, level, parent),
        );
    }

    /* general handling */
    if (typeof type === 'function') {
        return await renderFunctionalComponent(type, props, children, level + 1, parent);
    }
    else if (type === Fragment) {
        return await renderVNodes(children, level + 1, parent);
    }
    else {
        const hasNS = type.includes(':');

        const domElement = hasNS
            ? document.createElementNS(...splitNamespace(type))
            : document.createElement(type);

        // handle ref prop
        if (props['ref'] instanceof Observable) {
            const elementRef = props['ref'];
            delete props['ref'];

            LifecycleEventsManager.onMounted(domElement, level, () => {
                elementRef.value = domElement;
            });
            LifecycleEventsManager.onUnmounted(domElement, level, () => {
                elementRef.value = null;
            });
        }

        const { connectProps, disconnectProps } = setProps(domElement, props);
        LifecycleEventsManager.onMounted(domElement, level, connectProps);
        LifecycleEventsManager.onUnmounted(domElement, level, disconnectProps);
        if (parent && parent instanceof Node === false) {
            LifecycleEventsManager.setLogicalParent(domElement, parent);
        }
        domElement.append(...await renderVNodes(children, level + 1, domElement));
        return domElement;
    }
}

async function renderVNodes(
    vNodes: VNode | VNode[],
    level: number,
    parent?: Component | ParentNode,
): Promise<ChildNode[]> {
    vNodes = Array.isArray(vNodes) ? vNodes : [vNodes];
    const childNodes = await Promise.all(
        vNodes.flat().map(async vNode => renderVNode(vNode, level, parent)),
    );
    return childNodes.flat().filter(rNode => rNode !== null);
}

let componentId = -1;
async function renderFunctionalComponent(
    type: FunctionalComponent,
    props: PropsType,
    children: VNode | VNode[] | null,
    level: number,
    parent?: Component | ParentNode,
): Promise<RNode> {
    const setupHandlers: SetupHandler[] = [];
    const errorCapturedHandlers: ErrorCapturedHandler[] = [];

    const component: Component = {
        id: ++componentId,
        mountedChildCount: 0,
        ref: null,
    };
    let transientComponent: Component | null = component;

    // these callbacks should only be used during the construction of a functional component
    // which is why we use this transient reference
    const defineRef = (ref: unknown) => {
        if (transientComponent) {
            transientComponent.ref = ref;
        }
    };
    const componentEvents: ComponentEvents = {
        onSetup: (handler) => setupHandlers.push(handler),
        onErrorCaptured: (handler) => errorCapturedHandlers.push(handler),
        onMounted: (handler) =>
            transientComponent
            && LifecycleEventsManager.onMounted(transientComponent, level, handler),
        onUnmounted: (handler) =>
            transientComponent
            && LifecycleEventsManager.onUnmounted(transientComponent, level, handler),
        onReady: (handler) =>
            transientComponent
            && LifecycleEventsManager.onReady(transientComponent, level, handler),
        onRendered: (handler) =>
            transientComponent
            && LifecycleEventsManager.onRendered(transientComponent, level, handler),
    };

    let rNode: RNode = null;
    try {
        const vNode = type({ ...props, children }, componentEvents, { defineRef });
        await Promise.all(setupHandlers.map((setupHandler): MaybePromise<void> => setupHandler()));
        rNode = await renderVNode(vNode, level + 1, component);
    }
    catch (error) {
        const handled = errorCapturedHandlers.some(handler => handler(error) === false);
        if (!handled) {
            throw error;
        }
    }
    finally {
        transientComponent = null;
    }

    if (props['ref'] instanceof Observable) {
        const componentRef = props['ref'];

        LifecycleEventsManager.onMounted(component, level, () => {
            componentRef.value = component.ref;
        });
        LifecycleEventsManager.onUnmounted(component, level, () => {
            componentRef.value = null;
        });
    }

    if (parent && parent instanceof Node === false) {
        LifecycleEventsManager.setLogicalParent(component, parent);
    }

    return rNode;
}

function setProps<T extends HTMLElement | SVGElement>(elem: T, props: PropsType) {
    const subscribes: (() => Subscription)[] = [];
    let subscriptions: Subscription[] | null = null;

    function connectProps() {
        if (subscriptions !== null) {
            return;
        }
        subscriptions = subscribes.map(subscribe => subscribe());
    }
    function disconnectProps() {
        if (subscriptions === null) {
            return;
        }
        subscriptions?.forEach(subscription => subscription.unsubscribe());
        subscriptions = null;
    }

    Object.entries(props).forEach(([key, value]) => {
        if (key === 'style' && value instanceof Object) {
            Object.assign(elem.style, value);
        }
        else if (key === 'dataset' && value instanceof Object) {
            Object.assign(elem.dataset, value);
        }
        else if (/^on[A-Z]/.exec(key)) {
            elem.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
        }
        else if (hasKey(elem, key)) {
            if (value instanceof Observable) {
                subscribes.push(() =>
                    value.subscribe((value) => {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        elem[key] = value;
                    })
                );

                // two way updates for input element
                if (
                    elem instanceof HTMLInputElement
                    && ['value', 'valueAsNumber', 'valueAsDate', 'checked', 'files'].includes(key)
                ) {
                    const handleChange = () => {
                        value.value = elem[key];
                    };

                    subscribes.push(() => {
                        elem.addEventListener('change', handleChange);
                        return {
                            unsubscribe: () => elem.removeEventListener('change', handleChange),
                        };
                    });
                }

                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                elem[key] = value.value;
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                elem[key] = value as any;
            }
        }
        else {
            if (key.includes(':')) {
                elem.setAttributeNS(splitNamespace(key)[0], key, String(value));
            }
            else {
                elem.setAttribute(key, String(value));
            }
        }
    });

    return { connectProps, disconnectProps };
}

function splitNamespace(tagNS: string) {
    const [ns, tag] = tagNS.split(':', 1);
    if (!hasKey(XMLNamespaces, ns)) {
        throw new Error('Invalid namespace');
    }
    return [XMLNamespaces[ns], tag] as const;
}

type DOMElement = Element;

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace JSX {
    /* utility */
    type PropsOf<T extends DOMElement> = T extends SVGElement ? SVGProps<T> : DOMProps<T>;

    /* jsx defs */
    type Fragment = typeof Fragment;

    type Element = VNode;

    type BaseIntrinsicElements =
        & {
            [K in keyof HTMLElementTagNameMap]: PropsOf<HTMLElementTagNameMap[K]>;
        }
        & {
            [K in keyof SVGElementTagNameMap as `svg:${K}`]: PropsOf<SVGElementTagNameMap[K]>;
        };

    interface IntrinsicElements extends BaseIntrinsicElements {
        [Show]: ShowProps;
    }
}
