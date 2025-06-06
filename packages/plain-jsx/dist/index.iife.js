var PlainJSX = (function (exports, utils) {
    'use strict';

    const AddEvents = ['mounted', 'ready', 'rendered'];
    const RemoveEvents = ['unmounted'];
    const targetMap = new WeakMap();
    const targetParentMap = new WeakMap();
    const observer = new MutationObserver(onDOMUpdated);
    let isInitialized = false;
    function initialize() {
        if (isInitialized) {
            return;
        }
        isInitialized = true;
        observer.observe(document.body, { childList: true, subtree: true });
    }
    function register(target, priority, event, handler) {
        let handlers = targetMap.get(target);
        if (!handlers) {
            handlers = createLifecycleEventHandlers(priority);
            targetMap.set(target, handlers);
        }
        handlers[event].add(handler);
        return {
            unregister: () => handlers[event].delete(handler),
        };
    }
    function setLogicalParent(target, component) {
        targetParentMap.set(target, component);
    }
    function onMounted(target, priority, handler) {
        return register(target, priority, 'mounted', handler);
    }
    function onUnmounted(target, priority, handler) {
        return register(target, priority, 'unmounted', handler);
    }
    function onReady(target, priority, handler) {
        return register(target, priority, 'ready', handler);
    }
    function onRendered(target, priority, handler) {
        return register(target, priority, 'rendered', handler);
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
    function mergeEventHandlers(handlers, other, events) {
        for (const event of events) {
            handlers[event] = handlers[event].union(other[event]);
        }
    }
    function mergeEventHandlersGroupedByPriority(handlersList, handlers, events) {
        let existingHandlers = handlersList.find(existingHandlers => existingHandlers.priority === handlers.priority);
        if (!existingHandlers) {
            existingHandlers = createLifecycleEventHandlers(handlers.priority);
            handlersList.push(existingHandlers);
        }
        mergeEventHandlers(existingHandlers, handlers, events);
    }
    function onDOMUpdated(mutations) {
        const nodesMap = new Map();
        const getMeta = (node) => {
            let meta = nodesMap.get(node);
            if (!meta) {
                meta = { mountCount: 0 };
                nodesMap.set(node, meta);
            }
            return meta;
        };
        for (const mutation of mutations) {
            for (const addedNode of iterNodeList(mutation.addedNodes)) {
                const meta = getMeta(addedNode);
                meta.mountCount++;
            }
            for (const removedNode of iterNodeList(mutation.removedNodes)) {
                const meta = getMeta(removedNode);
                meta.mountCount--;
            }
        }
        const handlersList = [];
        const handleEventTarget = (target, events) => {
            const handlers = targetMap.get(target);
            if (!handlers) {
                return;
            }
            mergeEventHandlersGroupedByPriority(handlersList, handlers, events);
        };
        for (const [node, meta] of nodesMap.entries()) {
            let events;
            let handleAtCount;
            if (meta.mountCount > 0) {
                events = AddEvents;
                handleAtCount = 1;
            }
            else if (meta.mountCount < 0) {
                events = RemoveEvents;
                handleAtCount = 0;
            }
            else {
                continue;
            }
            let parent = targetParentMap.get(node);
            while (parent) {
                parent.mountedChildCount += meta.mountCount;
                if (parent.mountedChildCount === handleAtCount) {
                    handleEventTarget(parent, events);
                }
                parent = targetParentMap.get(parent);
            }
            handleEventTarget(node, events);
        }
        handlersList.sort((a, b) => b.priority - a.priority);
        void dispatchEvents(handlersList);
    }
    async function dispatchEvents(handlersList) {
        for (const handlers of handlersList) {
            await Promise.allSettled([...handlers.mounted, ...handlers.unmounted]
                .map((handler) => handler())).catch(console.error);
        }
        setTimeout(async () => {
            for (const handlers of handlersList) {
                await Promise.allSettled([...handlers.ready].map((handler) => handler()));
            }
        }, 0);
        requestAnimationFrame(() => {
            // can potentially handle onRender (before render) here!
            void Promise.resolve().then(async () => {
                for (const handlers of handlersList) {
                    await Promise.allSettled([...handlers.rendered].map((handler) => handler()));
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
        setLogicalParent,
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
    function createRef() {
        return new Observable(null);
    }

    class Sentinel {
    }
    const _Sentinel = new Sentinel();

    class ReactiveNode {
        placeholder = document.createComment('');
        children;
        constructor() {
            this.children = [this.placeholder];
        }
        update(rNode) {
            if (rNode === null || (Array.isArray(rNode) && rNode.length === 0)) {
                rNode = this.placeholder;
            }
            const children = Array.isArray(rNode) ? [...rNode] : [rNode];
            this.children.slice(1).forEach(child => child.remove());
            this.children[0].replaceWith(...children);
            this.children = children;
        }
        getRoot() {
            return this.children;
        }
    }
    const Show = 'Show';
    async function renderShow(props, children, renderVNodes) {
        const { when, cache } = props;
        if (when instanceof Observable === false) {
            throw new Error("The 'when' prop on <Show> is required and must be an Observable.");
        }
        const childrenOrFn = children;
        const getChildren = typeof childrenOrFn === 'function' ? childrenOrFn : () => childrenOrFn;
        let childNodes = null;
        const render = cache === false
            ? async () => await renderVNodes(getChildren())
            : async () => childNodes ??= await renderVNodes(getChildren());
        const reactiveNode = new ReactiveNode();
        if (when.value) {
            reactiveNode.update(await render());
        }
        when.subscribe(async (value) => {
            reactiveNode.update(value ? await render() : null);
        });
        return reactiveNode.getRoot();
    }
    function With(props) {
        throw new Error('This component cannot be called directly — it must be used through the render function.');
    }
    async function renderWith(props, children, renderVNodes) {
        const { value } = props;
        if (value instanceof Observable === false) {
            throw new Error("The 'value' prop on <With> is required and must be an Observable.");
        }
        if (typeof children !== 'function') {
            throw new Error('The <With> component must have exactly one child — a function that maps the value.');
        }
        const mapFn = children;
        const reactiveNode = new ReactiveNode();
        reactiveNode.update(await renderVNodes(mapFn(value.value)));
        value.subscribe(async (value) => {
            reactiveNode.update(await renderVNodes(mapFn(value)));
        });
        return reactiveNode.getRoot();
    }
    function For(props) {
        throw new Error('This component cannot be called directly — it must be used through the render function.');
    }
    async function renderFor(props, children, renderVNodes) {
        const { of } = props;
        if (of instanceof Observable === false) {
            throw new Error("The 'of' prop on <For> is required and must be an Observable.");
        }
        if (typeof children !== 'function') {
            throw new Error('The <For> component must have exactly one child — a function that maps each item.');
        }
        const mapFn = children;
        let cachedValues = [];
        const popCached = (value, index) => {
            const valIndex = cachedValues.findIndex(([_value, _index]) => _index === index && _value === value);
            if (valIndex === -1) {
                return _Sentinel;
            }
            const vNode = cachedValues[valIndex][2];
            cachedValues.splice(valIndex, 1);
            return vNode;
        };
        const render = async (value, index) => {
            let childNodes = _Sentinel;
            if (cachedValues.length) {
                childNodes = popCached(value, index);
            }
            return [
                value,
                index,
                childNodes instanceof Sentinel ? await renderVNodes(mapFn(value, index)) : childNodes,
            ];
        };
        const reactiveNode = new ReactiveNode();
        cachedValues = await Promise.all(of.value.map(render));
        reactiveNode.update(cachedValues.map(([, , vNode]) => vNode).flat());
        of.subscribe(async (items) => {
            cachedValues = await Promise.all(items.map(render));
            reactiveNode.update(cachedValues.map(([, , vNode]) => vNode).flat());
        });
        return reactiveNode.getRoot();
    }

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
            else if (utils.hasKey(elem, key)) {
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
        if (!utils.hasKey(XMLNamespaces, ns)) {
            throw new Error('Invalid namespace');
        }
        return [XMLNamespaces[ns], tag];
    }

    exports.For = For;
    exports.Fragment = Fragment;
    exports.Show = Show;
    exports.With = With;
    exports.createElement = createElement;
    exports.createObservable = createObservable;
    exports.createRef = createRef;
    exports.h = createElement;
    exports.render = render;

    return exports;

})({}, Utils);
