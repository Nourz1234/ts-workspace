import type { FunctionalComponent } from '@lib/plain-jsx';

const Fragments: FunctionalComponent = (_props, { onMounted }) => {
    onMounted(() => {
        console.info('Fragments: mounted!');
    });

    return (
        <>
            <span>Span 1</span>
            <>
                <span>Span 2</span>
                <span>Span 3</span>
            </>
            <span>Span 4</span>
            <>
                <>
                    <span>Span 5</span>
                </>
            </>
        </>
    );
};

export { Fragments };
