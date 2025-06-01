import type { MaybePromise, MethodsOf, ReadonlyProps, Setter } from '@lib/utils';
import type { Properties as CSS } from 'csstype';
import type { Observable } from './observable';
export type PropsType = Record<string, unknown>;
export interface VNodeElement {
    type: string | FunctionalComponent;
    props: PropsType;
    children: VNode[];
    isDev: boolean;
}
export type VNode = Observable<VNode> | VNodeElement | string | number | boolean | null | undefined;
export type VNodeChildren = VNode | VNode[];
export type FunctionalComponent<TProps = PropsType, TRef = never> = (props: TProps & CustomProps & RefProp<TRef>, events: ComponentEvents, helpers: Helpers<TRef>) => VNode;
export type RefType<T extends FunctionalComponent<never, unknown>> = T extends FunctionalComponent<never, infer TRef> ? TRef : never;
export type SetupHandler = () => Promise<void>;
export type EventHandler = () => MaybePromise<void>;
export type ErrorCapturedHandler = (error: unknown) => boolean | void;
interface Helpers<TRef> {
    /**
     * A helper function to define the component's ref interface.
     * @example
     * const Counter = () => {
     *      const count = createObservable<number>(0);
     *      const increment = () => count.value += 1;
     *      // this object will be exposed via the ref keyword of this component
     *      defineRef({ increment });
     *      return <button onClick={increment}>Count is {count}</button>;
     * };
     */
    defineRef: Setter<TRef>;
}
export interface ComponentEvents {
    /**
     * Registers an async handler that runs immediately after the functional component returns.
     * Useful for running asynchronous setup code within the component body (before mounting).
     *
     * Note: Rendering is deferred until all setup handlers have completed.
     * If you want to show placeholder content during data fetching, use `onMounted` instead.
     *
     * @example
     * const AsyncComponent = (props, { onSetup }) => {
     *      const message = createObservable<string | null>(null);
     *      // Functional components can't be async, so use this for async setup.
     *      onSetup(async () => {
     *          message.value = await fetchMessage();
     *      });
     *      return <span>{message}</span>
     * };
     */
    onSetup: (handler: SetupHandler) => void;
    /**
     * Registers a handler (can be async) that runs when the component is inserted into the active DOM.
     *
     * @example
     * const Button = (props, { onMounted }) => {
     *      const button = createObservable<HTMLButtonElement | null>(null);
     *      onMounted(() => {
     *          // can do stuff with button here
     *      });
     *      return <button ref={button} />;
     * };
     */
    onMounted: (handler: EventHandler) => void;
    /**
     * Registers a handler (can be async) that runs when the component is removed from the active DOM.
     */
    onUnmounted: (handler: EventHandler) => void;
    /**
     * Registers a handler (can be async) that runs on the tick immediately after the `onMounted` event.
     * Useful for actions that require the DOM to be fully updated, such as setting focus.
     *
     * @example
     * const Input = ({ focus }, { onReady }) => {
     *      const input = createObservable<HTMLInputElement | null>(null);
     *      onReady(() => {
     *          if (focus)
     *              input.value?.focus();
     *      });
     *      return <input ref={input} type="text" />;
     * };
     */
    onReady: (handler: EventHandler) => void;
    /**
     * Registers a handler that runs once, after the component's first render cycle following mount.
     */
    onRendered: (handler: EventHandler) => void;
    /**
     * Registers an error handler that captures errors occurring during the
     * functional component’s body execution, JSX render phase, and setup phase (`onSetup` event).
     */
    onErrorCaptured: (handler: ErrorCapturedHandler) => void;
}
interface CustomProps {
    children?: VNodeChildren;
}
interface RefProp<T> {
    ref?: Observable<T | null>;
}
type CommonProps<T extends Element> = (T extends ElementCSSInlineStyle ? {
    style?: CSS;
} : object) & (T extends HTMLOrSVGElement ? {
    dataset?: DOMStringMap;
} : object) & CustomProps & RefProp<T>;
type SettableProps<T extends Element> = Omit<T, keyof (ReadonlyProps<T> & MethodsOf<T> & CommonProps<T> & GlobalEventHandlers)>;
type TypedEvent<TElement extends Element, TEvent extends Event = Event> = Omit<TEvent, 'currentTarget'> & {
    currentTarget: TElement;
};
type DOMEvents<T extends Element> = {
    [K in keyof GlobalEventHandlersEventMap as `on${Capitalize<K>}`]?: (this: T, ev: TypedEvent<T, GlobalEventHandlersEventMap[K]>) => unknown;
};
type AcceptsObservable<T> = {
    [K in keyof T]: T[K] | Observable<T[K]>;
};
export type DOMProps<T extends Element> = Partial<AcceptsObservable<SettableProps<T>>> & CommonProps<T> & DOMEvents<T>;
export type SVGProps<T extends SVGElement> = DOMProps<T> & AcceptsObservable<Record<string, unknown>>;
export {};
