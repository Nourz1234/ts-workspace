import { MultiEntryCache } from './cache';
import { Observable, type Val, val } from './observable';
import type {
    IntermediateChildren,
    IntermediateNode,
    PropsType,
    VNode,
    VNodeChildren,
} from './types';

export class ReactiveNode {
    private readonly placeholder = document.createComment('');
    private _children: IntermediateNode[] = [this.placeholder];

    public get children() {
        return this._children;
    }

    public update(rNode: IntermediateNode[] | null) {
        const children = resolveReactiveNodes(this._children);

        if (rNode === null || rNode.length === 0) {
            // optimized clear path
            if (this._children.length === 1 && this._children[0] === this.placeholder) {
                return; // we are already cleared
            }

            const first = children.values().next().value;
            const parent = first?.parentNode;
            if (parent) {
                parent.insertBefore(this.placeholder, first);
                const fragment = document.createDocumentFragment();
                fragment.append(...children);
            }
            this._children = [this.placeholder];
            return;
        }

        const newChildren = resolveReactiveNodes(rNode);
        const newChildrenSet = new Set(newChildren);

        const first = children.values().next().value;
        const parent = first?.parentNode;
        if (parent) {
            const domChildren = parent.childNodes;
            const currentChildrenSet = new Set(children);

            if (
                currentChildrenSet.size === domChildren.length
                && newChildrenSet.isDisjointFrom(currentChildrenSet)
            ) {
                // optimized replace path
                parent.replaceChildren(...newChildren);
            }
            else {
                const fragment = document.createDocumentFragment(); // used in bulk updates
                const replaceCount = Math.min(currentChildrenSet.size, newChildren.length);
                const replacedSet = new Set<ChildNode>();

                const start = Array.prototype.indexOf.call(domChildren, first);
                for (let i = 0; i < replaceCount; ++i) {
                    const child = domChildren[start + i];
                    const newChild = newChildren[i];
                    if (!child) {
                        parent.append(...newChildren.slice(i));
                        break;
                    }
                    else if (!currentChildrenSet.has(child)) {
                        fragment.append(...newChildren.slice(i));
                        parent.insertBefore(fragment, child);
                        break;
                    }
                    else if (child !== newChild) {
                        if (!replacedSet.has(newChild)) {
                            parent.replaceChild(newChild, child);
                            replacedSet.add(child);
                        }
                        else {
                            parent.insertBefore(newChild, child);
                        }
                    }
                }

                if (currentChildrenSet.size > newChildren.length) {
                    // appending the excess children to the fragment will move them from their current parent to the fragment effectively removing them.
                    fragment.append(...currentChildrenSet.difference(newChildrenSet));
                }
                else if (currentChildrenSet.size < newChildren.length) {
                    fragment.append(...newChildren.slice(replaceCount));
                    parent.insertBefore(fragment, newChildren[replaceCount - 1].nextSibling);
                }
            }
        }

        this._children = rNode;
    }
}

export function resolveReactiveNodes(children: IntermediateNode[]): ChildNode[] {
    console.info(children);
    return children.flatMap((vNode) =>
        vNode instanceof ReactiveNode ? resolveReactiveNodes(vNode.children) : vNode
    );
}

export type CustomRenderFn = (
    props: PropsType,
    children: VNodeChildren,
    renderChildren: (children: VNodeChildren) => IntermediateNode[],
) => IntermediateChildren;

/* Show */
export interface ShowProps {
    when: boolean | Observable<boolean>;
    /**
     * - `true`: (default) Cache the children on the first show and re-use each time they are shown.
     * - `false`: No caching, children get rendered each time they are shown.
     */
    cache?: boolean;
    children: VNodeChildren | (() => VNode);
}

export const Show = 'Show';

export const renderShow: CustomRenderFn = (
    props: PropsType,
    children: VNodeChildren,
    renderChildren: (children: VNodeChildren) => IntermediateNode[],
): IntermediateChildren => {
    const { when, cache }: Partial<ShowProps> = props;

    const childrenOrFn: ShowProps['children'] = children;
    const getChildren = typeof childrenOrFn === 'function' ? childrenOrFn : () => childrenOrFn;

    let childNodes: IntermediateNode[] | null = null;
    const render = cache === false
        ? () => renderChildren(getChildren())
        : () => childNodes ??= renderChildren(getChildren());

    const reactiveNode = new ReactiveNode();

    if (when instanceof Observable) {
        if (when.value) {
            reactiveNode.update(render());
        }

        when.subscribe((value) => {
            reactiveNode.update(value ? render() : null);
        });
    }
    else {
        if (when) {
            reactiveNode.update(render());
        }
    }

    return reactiveNode;
};

/* For */
export interface ForProps<T> extends PropsType {
    of: Observable<T[]>;
    children: (item: T, index: Observable<number>) => VNode;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function For<T>(props: ForProps<T>): VNode {
    throw new Error(
        'This component cannot be called directly — it must be used through the render function.',
    );
}

export const renderFor: CustomRenderFn = (
    props: PropsType,
    children: VNodeChildren,
    renderChildren: (children: VNodeChildren) => IntermediateNode[],
): IntermediateChildren => {
    const { of }: Partial<ForProps<unknown>> = props;
    if (of instanceof Observable === false) {
        throw new Error("The 'of' prop on <For> is required and must be an Observable.");
    }
    if (typeof children !== 'function') {
        throw new Error(
            'The <For> component must have exactly one child — a function that maps each item.',
        );
    }
    const mapFn: ForProps<unknown>['children'] = children;

    type CachedItem = [Val<number>, IntermediateNode[]];

    let cache = new MultiEntryCache<CachedItem>();
    const render = (value: unknown, index: number): [unknown, CachedItem] => {
        let item = cache.get(value);
        if (!item) {
            const indexObservable = val(index);
            item = [indexObservable, renderChildren(mapFn(value, indexObservable))];
            cache.add(value, item);
        }
        else {
            item[0].value = index;
        }
        return [value, item];
    };

    const reactiveNode = new ReactiveNode();

    const childNodes = of.value.map(render);
    cache = new MultiEntryCache(childNodes);
    reactiveNode.update(childNodes.flatMap(([, item]) => item[1]));

    of.subscribe((items) => {
        const childNodes = items.map(render);
        cache = new MultiEntryCache(childNodes);
        reactiveNode.update(childNodes.flatMap(([, item]) => item[1]));
    });

    return reactiveNode;
};
