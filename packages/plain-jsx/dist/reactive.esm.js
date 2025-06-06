import { Observable } from './observable.esm.js';
import { Sentinel, _Sentinel } from './sintenel.esm.js';

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

export { For, ReactiveNode, Show, With, renderFor, renderShow, renderWith };
