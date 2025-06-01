import type { Action, MaybePromise } from '@lib/utils';
export interface Subscription {
    unsubscribe: Action;
}
export type Observer<T> = (value: T) => MaybePromise<void>;
/**
 * Simple observable value implementation
 */
export declare class Observable<T> {
    private readonly observers;
    private _value;
    private _hasDeferredNotifications;
    constructor(initialValue: T);
    get value(): T;
    set value(value: T);
    private notifyObservers;
    subscribe(observer: Observer<T>): Subscription;
    private unsubscribe;
}
export declare function createObservable<T>(initialValue: T): Observable<T>;
