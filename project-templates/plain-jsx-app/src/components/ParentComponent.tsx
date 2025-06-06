import {
    createObservable,
    type FunctionalComponent,
    type ParentComponent as _ParentComponent,
} from '@lib/plain-jsx';

interface DynamicChildrenProps extends _ParentComponent {
}

interface DynamicChildrenRefType {
    add: (value: string | number) => void;
    remove: (value: string | number) => void;
}

const ParentComponent: FunctionalComponent<DynamicChildrenProps, DynamicChildrenRefType> = (
    { children },
    { onMounted, onUnmounted },
    { defineRef },
) => {
    const content = createObservable<(string | number)[]>(['Text']);

    function add(value: string | number) {
        content.value = [...content.value, value];
    }

    function remove(value: string | number) {
        content.value = content.value.filter(item => item !== value);
    }

    defineRef({ add, remove });

    onMounted(() => {
        console.info('ParentComponent: mounted!');
    });

    onUnmounted(() => {
        console.info('ParentComponent: unmounted!');
    });

    return (
        <>
            {children}
        </>
    );
};

export { ParentComponent };
