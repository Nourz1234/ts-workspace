import { hasKey } from '@lib/utils';
import { LifecycleEventsManager } from './events.esm.js';
import { Observable } from './observable.esm.js';
import { ReactiveNode } from './reactive.esm.js';

const XMLNamespaces = {
    'svg': 'http://www.w3.org/2000/svg',
};
const Fragment = 'Fragment';
function createVNode(type, props = {}, children = [], isDev = false) {
    return { type, props, children, isDev };
}
function jsx(type, props) {
    let children = props.children ?? [];
    children = Array.isArray(children) ? children : [children];
    delete props.children;
    return createVNode(type, props, children, false);
}
function jsxDEV(type, props) {
    let children = props.children ?? [];
    children = Array.isArray(children) ? children : [children];
    delete props.children;
    return createVNode(type, props, children, true);
}
function createElement(tag, props, ...children) {
    return createVNode(tag, props, children);
}
async function render(root, element, handlers) {
    LifecycleEventsManager.initialize();
    const node = await renderVNode(element, 1);
    if (node === null) {
        return;
    }
    // NEEDS FIXING!!!!!!!!!!!!!!!!!!!!!!
    if (handlers) {
        LifecycleEventsManager.onMounted(node, node, 0, handlers.onMounted);
    }
    root.appendChild(node);
}
async function renderVNode(element, level, parentComponent) {
    if (element === undefined || element === null || typeof element === 'boolean') {
        return null;
    }
    else if (typeof element === 'string' || typeof element === 'number') {
        return document.createTextNode(String(element));
    }
    else if (element instanceof Observable) {
        const reactiveNode = new ReactiveNode();
        reactiveNode.update(await renderVNode(element.value, level + 1));
        element.subscribe(async (newElement) => {
            reactiveNode.update(await renderVNode(newElement, level + 1));
        });
        return reactiveNode.getRoot();
    }
    const renderChildren = async (node, children, parentComponent) => {
        const childNodes = await Promise.all(children.flat().map(async (child) => renderVNode(child, level + 1, parentComponent)));
        node.append(...childNodes.filter(node => node !== null));
    };
    const { type, props, children } = element;
    if (typeof type === 'function') {
        return await renderFunctionalComponent(type, props, children, level + 1);
    }
    else if (type === Fragment) {
        const fragment = document.createDocumentFragment();
        await renderChildren(fragment, children, parentComponent);
        return fragment;
    }
    else {
        const hasNS = type.includes(':');
        const domElement = hasNS
            ? document.createElementNS(...splitNamespace(type))
            : document.createElement(type);
        // handle ref prop
        const ref = new WeakRef(domElement);
        if (props['ref'] instanceof Observable) {
            const elementRef = props['ref'];
            delete props['ref'];
            LifecycleEventsManager.onMounted(domElement, domElement, level, () => {
                elementRef.value = ref.deref();
            });
            LifecycleEventsManager.onUnmounted(domElement, domElement, level, () => {
                elementRef.value = null;
            });
        }
        const { subscribeProps, unsubscribeProps } = setProps(domElement, props);
        LifecycleEventsManager.onMounted(domElement, domElement, level, subscribeProps);
        LifecycleEventsManager.onUnmounted(domElement, domElement, level, unsubscribeProps);
        if (parentComponent) {
            LifecycleEventsManager.registerIndirect(domElement, parentComponent, parentComponent.lcEventHandlers);
        }
        await renderChildren(domElement, children);
        return domElement;
    }
}
async function renderFunctionalComponent(type, props, children, level) {
    const setupHandlers = [];
    const errorCapturedHandlers = [];
    const lcEventHandlers = LifecycleEventsManager.createLifecycleEventHandlers(level);
    const componentEvents = {
        onSetup: (handler) => setupHandlers.push(handler),
        onErrorCaptured: (handler) => errorCapturedHandlers.push(handler),
        onMounted: (handler) => lcEventHandlers.mounted.add(handler),
        onUnmounted: (handler) => lcEventHandlers.unmounted.add(handler),
        onReady: (handler) => lcEventHandlers.ready.add(handler),
        onRendered: (handler) => lcEventHandlers.rendered.add(handler),
    };
    const component = {
        ref: null,
        lcEventHandlers,
    };
    const defineRef = (_ref) => {
        component.ref = new WeakRef(_ref);
    };
    if (props['ref'] instanceof Observable) {
        const componentRef = props['ref'];
        componentEvents.onMounted(() => {
            componentRef.value = component.ref?.deref();
        });
        componentEvents.onUnmounted(() => {
            componentRef.value = null;
        });
    }
    let node = null;
    try {
        const vNode = type({ ...props, children }, componentEvents, { defineRef });
        await Promise.all(setupHandlers.map((setupHandler) => setupHandler()));
        node = await renderVNode(vNode, level + 1, component);
    }
    catch (error) {
        const handled = errorCapturedHandlers.some(handler => handler(error) === false);
        if (!handled) {
            throw error;
        }
    }
    return node;
}
function setProps(elem, props) {
    const subscribes = [];
    let subscriptions = null;
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
            elem.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (hasKey(elem, key)) {
            if (value instanceof Observable) {
                subscribes.push(() => value.subscribe((value) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    elem[key] = value;
                }));
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
function splitNamespace(tagNS) {
    const [ns, tag] = tagNS.split(':', 1);
    if (!hasKey(XMLNamespaces, ns)) {
        throw new Error('Invalid namespace');
    }
    return [XMLNamespaces[ns], tag];
}

export { Fragment, createElement, createVNode, jsx, jsxDEV, jsx as jsxs, render };
