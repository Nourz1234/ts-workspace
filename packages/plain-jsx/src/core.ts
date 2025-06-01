import type { MaybePromise } from '@lib/utils';
import { hasKey } from '@lib/utils';
import { LifecycleEvents } from './events';
import type { Subscription } from './observable';
import { Observable } from './observable';
import { ReactiveNode } from './reactive';
import type {
    ComponentEvents,
    DOMProps,
    ErrorCapturedHandler,
    EventHandler,
    FunctionalComponent,
    PropsType,
    SetupHandler,
    SVGProps,
    VNode,
    VNodeChildren,
} from './types';

const XMLNamespaces = {
    'svg': 'http://www.w3.org/2000/svg' as const,
};

export const Fragment = 'Fragment';

export function createVNode(
    type: string | FunctionalComponent,
    props: PropsType = {},
    children: VNode[] = [],
    isDev = false,
): VNode {
    return { type, props, children, isDev };
}

export function jsx(
    type: string | FunctionalComponent,
    props: { children?: VNodeChildren },
): VNode {
    let children = props.children ?? [];
    children = Array.isArray(children) ? children : [children];
    delete props.children;
    return createVNode(type, props, children, false);
}

export { jsx as jsxs };

export function jsxDEV(
    type: string | FunctionalComponent,
    props: { children?: VNodeChildren },
) {
    let children = props.children ?? [];
    children = Array.isArray(children) ? children : [children];
    delete props.children;
    return createVNode(type, props, children, true);
}

export function createElement(
    tag: string | FunctionalComponent,
    props?: PropsType,
    ...children: VNode[]
): VNode {
    return createVNode(tag, props, children);
}

export async function render(
    root: Element | DocumentFragment,
    element: VNode,
    handlers?: { onMounted: EventHandler },
) {
    const events = new LifecycleEvents();
    const node = await renderVNode(element, events, 1);
    if (node === null) {
        return;
    }

    if (handlers) {
        events.onMounted(node, 0, handlers.onMounted);
    }

    root.appendChild(node);
}

async function renderVNode(
    element: VNode,
    events: LifecycleEvents,
    level: number,
): Promise<Node | null> {
    if (element === undefined || element === null || typeof element === 'boolean') {
        return null;
    }
    else if (typeof element === 'string' || typeof element === 'number') {
        return document.createTextNode(String(element));
    }
    else if (element instanceof Observable) {
        const reactiveNode = new ReactiveNode();
        reactiveNode.update(await renderVNode(element.value, events, level + 1));

        element.subscribe(async (newElement) => {
            reactiveNode.update(await renderVNode(newElement, events, level + 1));
        });
        return reactiveNode.getRoot();
    }

    const renderChildren = async (node: Element | DocumentFragment, children: VNode[]) => {
        const childNodes = await Promise.all(
            children.flat().map(async child => renderVNode(child, events, level + 1)),
        );
        node.append(...childNodes.filter(node => node !== null));
    };

    const { type, props, children } = element;
    if (typeof type === 'function') {
        return await renderFunctionalComponent(type, props, children, events, level + 1);
    }
    else if (type === Fragment) {
        const fragment = document.createDocumentFragment();
        await renderChildren(fragment, children);
        return fragment;
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

            events.onMounted(domElement, level, () => {
                elementRef.value = domElement;
            });
            events.onUnmounted(domElement, level, () => {
                elementRef.value = null;
            });
        }

        const { subscribeProps, unsubscribeProps } = setProps(domElement, props);
        events.onMounted(domElement, level, subscribeProps);
        events.onUnmounted(domElement, level, unsubscribeProps);
        await renderChildren(domElement, children);
        return domElement;
    }
}

async function renderFunctionalComponent(
    type: FunctionalComponent,
    props: PropsType,
    children: VNode[],
    events: LifecycleEvents,
    level: number,
): Promise<Node | null> {
    const componentRef = props['ref'];

    function defineRef(ref: unknown) {
        if (componentRef instanceof Observable) {
            componentRef.value = ref;
        }
    }

    const setupHandlers: SetupHandler[] = [];
    const mountedHandlers: EventHandler[] = [];
    const unmountedHandlers: EventHandler[] = [];
    const readyHandlers: EventHandler[] = [];
    const renderedHandlers: EventHandler[] = [];
    const errorCapturedHandlers: ErrorCapturedHandler[] = [];

    const componentEvents: ComponentEvents = {
        onSetup: (handler: SetupHandler) => setupHandlers.push(handler),
        onMounted: (handler: EventHandler) => mountedHandlers.push(handler),
        onUnmounted: (handler: EventHandler) => unmountedHandlers.push(handler),
        onReady: (handler: EventHandler) => readyHandlers.push(handler),
        onRendered: (handler: EventHandler) => renderedHandlers.push(handler),
        onErrorCaptured: (handler: ErrorCapturedHandler) => errorCapturedHandlers.push(handler),
    };

    let node: Node | null = null;
    try {
        const vNode = type({ ...props, children }, componentEvents, { defineRef });
        await Promise.all(setupHandlers.map((setupHandler): MaybePromise<void> => setupHandler()));
        node = await renderVNode(vNode, events, level + 1);
    }
    catch (error) {
        const handled = errorCapturedHandlers.some(handler => handler(error) === false);
        if (!handled) {
            throw error;
        }
    }

    if (!node) {
        return null;
    }

    const realNode = node instanceof DocumentFragment ? node.firstChild : node;
    // TODO: it should be that when any of the fragment children get mounted
    // we mount the component
    // and when all children get unmounted we unmount the component
    // A problem for another day!
    if (!realNode) {
        return null;
    }

    if (componentRef instanceof Observable) {
        componentEvents.onUnmounted(() => {
            componentRef.value = null;
        });
    }

    mountedHandlers.map(handler => events.onMounted(realNode, level, handler));
    unmountedHandlers.map(handler => events.onUnmounted(realNode, level, handler));
    readyHandlers.map(handler => events.onReady(realNode, level, handler));
    renderedHandlers.map(handler => events.onRendered(realNode, level, handler));

    return node;
}

function setProps<T extends HTMLElement | SVGElement>(elem: T, props: object) {
    const subscribes: (() => Subscription)[] = [];
    let subscriptions: Subscription[] | null = null;

    function subscribeProps() {
        if (subscriptions !== null) {
            return;
        }
        subscriptions = subscribes.map(subscribe => subscribe());
    }
    function unsubscribeProps() {
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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                elem[key] = value.value;
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                elem[key] = value;
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

    return { subscribeProps, unsubscribeProps };
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

    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends BaseIntrinsicElements {
        // allow extending
    }
}
