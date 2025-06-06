import type { Action, MaybePromise } from '@lib/utils';
import type { FunctionalComponent } from '.';

export interface Subscription {
    unsubscribe: Action;
}

export type Observer<T> = (value: T) => MaybePromise<void>;

/**
 * Simple observable value implementation
 */
export class Observable<T> {
    private readonly observers = new Set<Observer<T>>();
    private _value: T;
    private _hasDeferredNotifications = false;

    public constructor(initialValue: T) {
        this._value = initialValue;
    }

    public get value() {
        return this._value;
    }

    public set value(value) {
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

    private notifyObservers() {
        void Promise.all(
            [...this.observers].map(
                (subscription): MaybePromise<void> => subscription(this._value),
            ),
        );
        this._hasDeferredNotifications = false;
    }

    public subscribe(observer: Observer<T>): Subscription {
        this.observers.add(observer);
        return {
            unsubscribe: () => this.unsubscribe(observer),
        };
    }

    private unsubscribe(observer: Observer<T>) {
        this.observers.delete(observer);
    }
}

export function createObservable<T>(initialValue: T) {
    return new Observable<T>(initialValue);
}

export function createRef<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends Element | FunctionalComponent<never, any>,
    U = T extends Element ? T : T extends FunctionalComponent<never, infer TRef> ? TRef : never,
>(): Observable<U | null> {
    return new Observable<U | null>(null);
}
