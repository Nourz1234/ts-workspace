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

export { Observable, createObservable };
