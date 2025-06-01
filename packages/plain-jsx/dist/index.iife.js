var PlainJSX = (function (exports, utils) {
    'use strict';

    class LifecycleEvents {
        handlersMap = new WeakMap();
        static AddEvents = ['mounted', 'ready', 'rendered'];
        static RemoveEvents = ['unmounted'];
        constructor() {
            const observer = new MutationObserver(this.domUpdated.bind(this));
            observer.observe(document.body, { childList: true, subtree: true });
        }
        domUpdated(mutations) {
            const handlersList = [];
            for (const mutation of mutations) {
                for (const addedNode of iterNodeList(mutation.addedNodes)) {
                    const nodeHandlers = this.handlersMap.get(addedNode);
                    if (nodeHandlers) {
                        LifecycleEvents.mergeHandlers(handlersList, nodeHandlers, LifecycleEvents.AddEvents);
                    }
                }
                for (const removedNode of iterNodeList(mutation.removedNodes)) {
                    const nodeHandlers = this.handlersMap.get(removedNode);
                    if (nodeHandlers) {
                        LifecycleEvents.mergeHandlers(handlersList, nodeHandlers, LifecycleEvents.RemoveEvents);
                    }
                }
            }
            void LifecycleEvents.handleChanges(handlersList);
        }
        static mergeHandlers(handlersList, nodeHandlers, events) {
            let existingHandlers = handlersList.find(handlers => handlers.level === nodeHandlers.level);
            if (!existingHandlers) {
                existingHandlers = {
                    level: nodeHandlers.level,
                    mounted: new Set(),
                    ready: new Set(),
                    rendered: new Set(),
                    unmounted: new Set(),
                };
                handlersList.push(existingHandlers);
            }
            for (const event of events) {
                existingHandlers[event] = existingHandlers[event].union(nodeHandlers[event]);
            }
        }
        static async handleChanges(handlersList) {
            for (const handlers of handlersList) {
                await Promise.all([...handlers.mounted, ...handlers.unmounted]
                    .map((handler) => handler()));
            }
            setTimeout(async () => {
                for (const handlers of handlersList) {
                    await Promise.all([...handlers.ready].map((handler) => handler()));
                }
            }, 0);
            requestAnimationFrame(() => {
                // can potentially handle onRender (before render) here!
                void Promise.resolve().then(async () => {
                    for (const handlers of handlersList) {
                        await Promise.all([...handlers.rendered].map((handler) => handler()));
                    }
                });
            });
        }
        register(node, level, event, handler) {
            let nodeHandlers = this.handlersMap.get(node);
            if (!nodeHandlers) {
                nodeHandlers = {
                    level,
                    mounted: new Set(),
                    ready: new Set(),
                    rendered: new Set(),
                    unmounted: new Set(),
                };
                this.handlersMap.set(node, nodeHandlers);
            }
            nodeHandlers[event].add(handler);
            return {
                unregister: () => nodeHandlers[event].delete(handler),
            };
        }
        onMounted(node, level, handler) {
            return this.register(node, level, 'mounted', handler);
        }
        onUnmounted(node, level, handler) {
            return this.register(node, level, 'unmounted', handler);
        }
        onReady(node, level, handler) {
            return this.register(node, level, 'ready', handler);
        }
        onRendered(node, level, handler) {
            return this.register(node, level, 'rendered', handler);
        }
    }
    function* iterNodeDescendants(node) {
        const walker = document.createNodeIterator(node, NodeFilter.SHOW_ALL);
        let current;
        while ((current = walker.nextNode())) {
            yield current;
        }
    }
    function* iterNodeList(nodes) {
        for (const node of nodes) {
            for (const subNode of iterNodeDescendants(node)) {
                yield subNode;
            }
        }
    }

    /**
     * Simple observable value implementation
     */
    class Observable {
        observers = new Set();
        _value;
        _hasDeferredNotifications = false;
        constructor(initialValue) {
            this._value = initialValue;
        }
        get value() {
            return this._value;
        }
        set value(value) {
            if (this._value === value) {
                return;
            }
            this._value = value;
            if (this._hasDeferredNotifications) {
                return;
            }
            this._hasDeferredNotifications = true;
            // Since this is closely tied to reactivity and UI updates,
            // I think it's proper to run the updates on next render.
            requestAnimationFrame(() => this.notifyObservers());
        }
        notifyObservers() {
            void Promise.all([...this.observers].map((subscription) => subscription(this._value)));
            this._hasDeferredNotifications = false;
        }
        subscribe(observer) {
            this.observers.add(observer);
            return {
                unsubscribe: () => this.unsubscribe(observer),
            };
        }
        unsubscribe(observer) {
            this.observers.delete(observer);
        }
    }
    function createObservable(initialValue) {
        return new Observable(initialValue);
    }

    class ReactiveNode {
        static resolveNode(node) {
            return node instanceof DocumentFragment
                ? Array.from(node.childNodes)
                : [node];
        }
        children = [document.createComment('')];
        update(node) {
            node ??= document.createComment('');
            const children = ReactiveNode.resolveNode(node);
            const firstChild = this.children[0];
            const parentNode = firstChild.parentNode;
            if (parentNode) {
                const newChildren = Array.from(parentNode.childNodes);
                newChildren.splice(newChildren.indexOf(firstChild), this.children.length, ...children);
                parentNode.replaceChildren(...newChildren);
            }
            this.children = children;
        }
        getRoot() {
            const fragment = document.createDocumentFragment();
            fragment.append(...this.children);
            return fragment;
        }
    }
    // another version utilizing Set.difference
    // export class ReactiveNode {
    //     private static resolveNode(node: Node): Set<Node> {
    //         return node instanceof DocumentFragment
    //             ? new Set(node.childNodes)
    //             : new Set([node]);
    //     }
    //     private children = new Set<Node>([document.createComment('')]);
    //     public update(node: Node | null) {
    //         node ??= document.createComment('');
    //         const children = ReactiveNode.resolveNode(node);
    //         const firstChild = this.children.values().next().value!;
    //         const parentNode = firstChild.parentNode;
    //         if (parentNode) {
    //             const existingChildren: Node[] = Array.from(parentNode.childNodes);
    //             existingChildren.splice(existingChildren.indexOf(firstChild), 0, ...children);
    //             const newChildren = new Set(existingChildren).difference(this.children);
    //             parentNode.replaceChildren(...newChildren);
    //         }
    //         this.children = children;
    //     }
    //     public getRoot(): Node {
    //         const fragment = document.createDocumentFragment();
    //         fragment.append(...this.children);
    //         return fragment;
    //     }
    // }

    const XMLNamespaces = {
        'svg': 'http://www.w3.org/2000/svg',
    };
    const Fragment = 'Fragment';
    function createVNode(type, props = {}, children = [], isDev = false) {
        return { type, props, children, isDev };
    }
    function createElement(tag, props, ...children) {
        return createVNode(tag, props, children);
    }
    async function render(root, element, handlers) {
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
    async function renderVNode(element, events, level) {
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
        const renderChildren = async (node, children) => {
            const childNodes = await Promise.all(children.flat().map(async (child) => renderVNode(child, events, level + 1)));
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
    async function renderFunctionalComponent(type, props, children, events, level) {
        const componentRef = props['ref'];
        function defineRef(ref) {
            if (componentRef instanceof Observable) {
                componentRef.value = ref;
            }
        }
        const setupHandlers = [];
        const mountedHandlers = [];
        const unmountedHandlers = [];
        const readyHandlers = [];
        const renderedHandlers = [];
        const errorCapturedHandlers = [];
        const componentEvents = {
            onSetup: (handler) => setupHandlers.push(handler),
            onMounted: (handler) => mountedHandlers.push(handler),
            onUnmounted: (handler) => unmountedHandlers.push(handler),
            onReady: (handler) => readyHandlers.push(handler),
            onRendered: (handler) => renderedHandlers.push(handler),
            onErrorCaptured: (handler) => errorCapturedHandlers.push(handler),
        };
        let node = null;
        try {
            const vNode = type({ ...props, children }, componentEvents, { defineRef });
            await Promise.all(setupHandlers.map((setupHandler) => setupHandler()));
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
            else if (utils.hasKey(elem, key)) {
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
        if (!utils.hasKey(XMLNamespaces, ns)) {
            throw new Error('Invalid namespace');
        }
        return [XMLNamespaces[ns], tag];
    }

    exports.Fragment = Fragment;
    exports.createElement = createElement;
    exports.createObservable = createObservable;
    exports.h = createElement;
    exports.render = render;

    return exports;

})({}, Utils);
