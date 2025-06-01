import { createObservable, type FunctionalComponent } from '@lib/plain-jsx';

interface CounterProps {
}

export interface CounterRefType {
    increment: () => void;
}

const Counter: FunctionalComponent<CounterProps, CounterRefType> = (
    _props,
    _events,
    { defineRef },
) => {
    const count = createObservable<number>(0);
    const increment = () => {
        count.value += 1;
    };

    defineRef({ increment });

    return (
        <button type='button' onClick={increment}>
            count is {count}
        </button>
    );
};

export { Counter };
