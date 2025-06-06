import { Observable } from './observable';
import { _Sentinel, Sentinel } from './sintenel';
import type { PropsType, RNode, VNode, VNodeChildren } from './types';

export class ReactiveNode {
    private readonly placeholder = document.createComment('');
    private children: ChildNode[];

    public constructor() {
        this.children = [this.placeholder];
    }

    public update(rNode: RNode) {
        if (rNode === null || (Array.isArray(rNode) && rNode.length === 0)) {
            rNode = this.placeholder;
        }

        const children = Array.isArray(rNode) ? [...rNode] : [rNode];

        this.children.slice(1).forEach(child => child.remove());
        this.children[0].replaceWith(...children);

        this.children = children;
    }

    public getRoot(): ChildNode[] {
        return this.children;
    }
}

export type CustomRenderFn = (
    props: PropsType,
    children: VNodeChildren,
    renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>,
) => Promise<RNode>;

/* Show */
export interface ShowProps {
    when: Observable<boolean>;
    /**
     * - `true`: (default) Cache the children on the first show and re-use each time they are shown.
     * - `false`: No caching, children get rendered each time they are shown.
     */
    cache?: boolean;
    children: VNodeChildren | (() => VNode);
}

export const Show = 'Show';

export async function renderShow(
    props: PropsType,
    children: VNodeChildren,
    renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>,
): Promise<RNode> {
    const { when, cache }: Partial<ShowProps> = props;
    if (when instanceof Observable === false) {
        throw new Error("The 'when' prop on <Show> is required and must be an Observable.");
    }

    const childrenOrFn: ShowProps['children'] = children;
    const getChildren = typeof childrenOrFn === 'function' ? childrenOrFn : () => childrenOrFn;

    let childNodes: ChildNode[] | null = null;
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

/* With */
export interface WithProps<T> {
    value: Observable<T>;
    children: (value: T) => VNode;
}

export function With<T>(props: WithProps<T>): VNode {
    throw new Error(
        'This component cannot be called directly — it must be used through the render function.',
    );
}

export async function renderWith(
    props: PropsType,
    children: VNodeChildren,
    renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>,
): Promise<RNode> {
    const { value }: Partial<WithProps<unknown>> = props;
    if (value instanceof Observable === false) {
        throw new Error("The 'value' prop on <With> is required and must be an Observable.");
    }

    if (typeof children !== 'function') {
        throw new Error(
            'The <With> component must have exactly one child — a function that maps the value.',
        );
    }
    const mapFn: WithProps<unknown>['children'] = children;

    const reactiveNode = new ReactiveNode();

    reactiveNode.update(await renderVNodes(mapFn(value.value)));

    value.subscribe(async (value) => {
        reactiveNode.update(await renderVNodes(mapFn(value)));
    });

    return reactiveNode.getRoot();
}

/* For */
export interface ForProps<T> extends PropsType {
    of: Observable<T[]>;
    children: (item: T, index: number) => VNode;
}

export function For<T>(props: ForProps<T>): VNode {
    throw new Error(
        'This component cannot be called directly — it must be used through the render function.',
    );
}

export async function renderFor(
    props: PropsType,
    children: VNodeChildren,
    renderVNodes: (vNodes: VNodeChildren) => Promise<ChildNode[]>,
): Promise<RNode> {
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

    type CachedItem = [unknown, number, ChildNode[]];

    let cachedValues: CachedItem[] = [];
    const popCached = (value: unknown, index: number): ChildNode[] | Sentinel => {
        const valIndex = cachedValues.findIndex(([_value, _index]) =>
            _index === index && _value === value
        );
        if (valIndex === -1) {
            return _Sentinel;
        }
        const vNode = cachedValues[valIndex][2];
        cachedValues.splice(valIndex, 1);
        return vNode;
    };
    const render = async (value: unknown, index: number): Promise<CachedItem> => {
        let childNodes: ChildNode[] | Sentinel = _Sentinel;
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
