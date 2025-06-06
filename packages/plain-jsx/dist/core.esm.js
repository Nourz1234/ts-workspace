import { hasKey } from '@lib/utils';
import { LifecycleEventsManager } from './events.esm.js';
import { Observable } from './observable.esm.js';
import { Show, renderShow, With, renderWith, For, renderFor, ReactiveNode } from './reactive.esm.js';

const XMLNamespaces = {
    'svg': 'http://www.w3.org/2000/svg',
};
const Fragment = 'Fragment';
/* built-in components that have special handling */
const BuiltinComponents = new Map([
    [Show, renderShow],
    [With, renderWith],
    [For, renderFor],
]);
function createVNode(type, props, children) {
    return { type, props: props ?? {}, children };
}
function jsx(type, props) {
    const { children } = props;
    delete props.children;
    return createVNode(type, props, children);
}
function createElement(tag, props, ...children) {
    return createVNode(tag, props, children);
}
async function render(root, vNode) {
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
async function renderVNode(vNode, level, parent) {
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
            let subscription = null;
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
        return await renderBuiltin(props, children, async (vNodes) => renderVNodes(vNodes, level, parent));
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
async function renderVNodes(vNodes, level, parent) {
    vNodes = Array.isArray(vNodes) ? vNodes : [vNodes];
    const childNodes = await Promise.all(vNodes.flat().map(async (vNode) => renderVNode(vNode, level, parent)));
    return childNodes.flat().filter(rNode => rNode !== null);
}
let componentId = -1;
async function renderFunctionalComponent(type, props, children, level, parent) {
    const setupHandlers = [];
    const errorCapturedHandlers = [];
    const component = {
        id: ++componentId,
        mountedChildCount: 0,
        ref: null,
    };
    let transientComponent = component;
    // these callbacks should only be used during the construction of a functional component
    // which is why we use this transient reference
    const defineRef = (ref) => {
        if (transientComponent) {
            transientComponent.ref = ref;
        }
    };
    const componentEvents = {
        onSetup: (handler) => setupHandlers.push(handler),
        onErrorCaptured: (handler) => errorCapturedHandlers.push(handler),
        onMounted: (handler) => transientComponent
            && LifecycleEventsManager.onMounted(transientComponent, level, handler),
        onUnmounted: (handler) => transientComponent
            && LifecycleEventsManager.onUnmounted(transientComponent, level, handler),
        onReady: (handler) => transientComponent
            && LifecycleEventsManager.onReady(transientComponent, level, handler),
        onRendered: (handler) => transientComponent
            && LifecycleEventsManager.onRendered(transientComponent, level, handler),
    };
    let rNode = null;
    try {
        const vNode = type({ ...props, children }, componentEvents, { defineRef });
        await Promise.all(setupHandlers.map((setupHandler) => setupHandler()));
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
function setProps(elem, props) {
    const subscribes = [];
    let subscriptions = null;
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
            elem.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (hasKey(elem, key)) {
            if (value instanceof Observable) {
                subscribes.push(() => value.subscribe((value) => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    elem[key] = value;
                }));
                // two way updates for input element
                if (elem instanceof HTMLInputElement
                    && ['value', 'valueAsNumber', 'valueAsDate', 'checked', 'files'].includes(key)) {
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
    return { connectProps, disconnectProps };
}
function splitNamespace(tagNS) {
    const [ns, tag] = tagNS.split(':', 1);
    if (!hasKey(XMLNamespaces, ns)) {
        throw new Error('Invalid namespace');
    }
    return [XMLNamespaces[ns], tag];
}

export { Fragment, createElement, createVNode, jsx, jsx as jsxDEV, jsx as jsxs, render };
