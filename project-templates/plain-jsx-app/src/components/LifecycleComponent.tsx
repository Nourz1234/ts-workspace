import { createObservable, type FunctionalComponent, type ParentComponent } from '@lib/plain-jsx';

interface LifecycleComponentProps extends ParentComponent {
    name?: string;
}

let count = 0;

const LifecycleComponent: FunctionalComponent<LifecycleComponentProps> = (
    { name, children },
    { onMounted, onUnmounted, onReady, onRendered },
) => {
    name = name ?? `LifecycleComponent ${++count}`;

    const span = createObservable<HTMLButtonElement | null>(null);
    const title = createObservable<string>(name);
    const reg = new FinalizationRegistry((heldValue) => {
        console.info(`${heldValue} has been garbage collected`);
    });

    onMounted(() => {
        console.info(`${name}: mounted!`, span.value?.tagName);
        reg.register(span.value!, name);
    });

    onUnmounted(() => {
        console.info(`${name}: unmounted!`, span.value?.tagName);
    });

    onReady(() => {
        console.info(`${name}: ready!`);
    });

    onRendered(() => {
        console.info(`${name}: rendered!`);
    });

    return <span ref={span} title={title}>{children}</span>;
};

export { LifecycleComponent };
