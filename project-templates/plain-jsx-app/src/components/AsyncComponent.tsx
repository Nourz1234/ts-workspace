import { createObservable, type FunctionalComponent } from '@lib/plain-jsx';
import { sleep } from '@lib/utils';

async function fetchMessage() {
    await sleep(500);
    return 'Async message!';
}

const AsyncComponent: FunctionalComponent = (_props, { onSetup }) => {
    const message = createObservable<string | null>(null);

    onSetup(async () => {
        message.value = await fetchMessage();
    });

    return <span>{message}</span>;
};

export { AsyncComponent };
