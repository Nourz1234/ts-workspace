import { createObservable, type FunctionalComponent } from '@lib/plain-jsx';

const LifeTimeComponent: FunctionalComponent = (
    _props,
    { onMounted, onUnmounted, onReady, onRendered },
) => {
    const button = createObservable<HTMLButtonElement | null>(null);
    const title = createObservable<string>("LifeTimeComponent")
    const reg = new FinalizationRegistry((heldValue) => {
        console.info(`${heldValue} has been garbage collected`);
    });

    onMounted(() => {
        console.info('LifeTimeComponent: mounted!', button.value?.toString());
        reg.register(button.value!, 'LifeTimeComponent');
    });

    onUnmounted(() => {
        console.info('LifeTimeComponent: unmounted!', button.value);
    });

    onReady(() => {
        console.info('LifeTimeComponent: ready!');
    });

    onRendered(() => {
        console.info('LifeTimeComponent: rendered!');
    });

    return <button ref={button} title={title}>LifeTimeComponent</button>;
};

export { LifeTimeComponent };
