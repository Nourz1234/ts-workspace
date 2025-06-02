var PlainJSX = (function (exports, utils) {
    'use strict';

    const AddEvents = ['mounted', 'ready', 'rendered'];
    const RemoveEvents = ['unmounted'];
    const nodeEventMap = new WeakMap();
    const observer = new MutationObserver(onDOMUpdated);
    let isInitialized = false;
    function initialize() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;
        observer.observe(document.body, { childList: true, subtree: true });
    }
    function register(node, target, priority, event, handler) {
        let handlers = nodeEventMap.get(node);
        if (!handlers) {
            handlers = createTargetEventHandlers(target, priority);
            nodeEventMap.set(node, handlers);
        }
        handlers[event].add(handler);
        return {
            unregister: () => handlers[event].delete(handler),
        };
    }
    function registerIndirect(node, target, handlers) {
        let existingHandlers = nodeEventMap.get(node);
        if (!existingHandlers) {
            existingHandlers = createTargetEventHandlers(target, handlers.priority);
            nodeEventMap.set(node, existingHandlers);
        }
        mergeEventHandlers(existingHandlers, handlers, [
            'mounted',
            'unmounted',
            'ready',
            'rendered',
        ]);
    }
    function onMounted(node, target, priority, handler) {
        return register(node, target, priority, 'mounted', handler);
    }
    function onUnmounted(node, target, priority, handler) {
        return register(node, target, priority, 'unmounted', handler);
    }
    function onReady(node, target, priority, handler) {
        return register(node, target, priority, 'ready', handler);
    }
    function onRendered(node, target, priority, handler) {
        return register(node, target, priority, 'rendered', handler);
    }
    function createLifecycleEventHandlers(priority) {
        return {
            priority,
            mounted: new Set(),
            ready: new Set(),
            rendered: new Set(),
            unmounted: new Set(),
        };
    }
    function createTargetEventHandlers(target, priority) {
        const handlers = createLifecycleEventHandlers(priority);
        return {
            target: new WeakRef(target),
            mounts: 0,
            ...handlers,
        };
    }
    function mergeEventHandlers(handlers, other, events) {
        for (const event of events) {
            handlers[event] = handlers[event].union(other[event]);
        }
    }
    function mergeEventHandlersGroupedByPriority(handlersList, handlers, events) {
        let existingHandlers = handlersList.find(handlers => handlers.priority === handlers.priority);
        if (!existingHandlers) {
            existingHandlers = createLifecycleEventHandlers(handlers.priority);
            handlersList.push(existingHandlers);
        }
        mergeEventHandlers(existingHandlers, handlers, events);
    }
    function onDOMUpdated(mutations) {
        const handlersList = [];
        for (const mutation of mutations) {
            for (const addedNode of iterNodeList(mutation.addedNodes)) {
                const handlers = nodeEventMap.get(addedNode);
                if (!handlers) {
                    continue;
                }
                if (handlers.mounts === 0) {
                    continue;
                }
                ++handlers.mounts;
                mergeEventHandlersGroupedByPriority(handlersList, handlers, AddEvents);
            }
            for (const removedNode of iterNodeList(mutation.removedNodes)) {
                const handlers = nodeEventMap.get(removedNode);
                if (!handlers) {
                    continue;
                }
                --handlers.mounts;
                if (handlers.mounts !== 0) {
                    continue;
                }
                mergeEventHandlersGroupedByPriority(handlersList, handlers, RemoveEvents);
            }
        }
        handlersList.sort(x => x.priority);
        void dispatchEvents(handlersList);
    }
    async function dispatchEvents(handlersList) {
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
    const LifecycleEventsManager = {
        initialize,
        register,
        registerIndirect,
        onMounted,
        onUnmounted,
        onReady,
        onRendered,
        createLifecycleEventHandlers,
    };

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
