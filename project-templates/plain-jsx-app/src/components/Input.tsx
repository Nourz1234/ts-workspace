import { createObservable, type FunctionalComponent, type JSX } from '@lib/plain-jsx';

interface InputProps extends JSX.PropsOf<HTMLInputElement> {
    focus?: boolean;
}

const Input: FunctionalComponent<InputProps, HTMLInputElement> = (
    { focus, ...props },
    { onReady, onMounted },
    { defineRef },
) => {
    const input = createObservable<HTMLInputElement | null>(null);

    onMounted(() => {
        if (input.value) {
            defineRef(input.value);
        }
    });

    onReady(() => {
        console.info("Input: ready!");
        if (focus) {
            input.value?.focus();
        }
    });

    return <input ref={input} {...props} />;
};

export { Input };
