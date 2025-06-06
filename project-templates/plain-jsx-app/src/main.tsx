import './style.css';
import viteLogo from '/vite.svg';
import {
    createObservable,
    For,
    type FunctionalComponent,
    render,
    Show,
    With,
} from '@lib/plain-jsx';
import { AsyncComponent } from './components/AsyncComponent';
import { Counter, type CounterRefType } from './components/Counter';
import { Fragments } from './components/Fragments';
import { Input } from './components/Input';
import { LifecycleComponent } from './components/LifecycleComponent';
import { ParentComponent } from './components/ParentComponent';
import typescriptLogo from './typescript.svg';

const App: FunctionalComponent = () => {
    const showDynamicComponent = createObservable<boolean>(false);
    const items1 = createObservable<number[]>([1, 2, 3]);
    const items2 = createObservable<string[]>(['Test']);
    const counter = createObservable<CounterRefType | null>(null);
    const switchValue = createObservable<number>(0);

    setInterval(() => {
        switchValue.value += 1;
    }, 1000);

    function createTimer() {
        const timer = createObservable<string>("0");
        const start = performance.now();

        setInterval(() => {
            timer.value = ((performance.now() - start) / 1000).toFixed(1);
        }, 100);
        return timer;
    }

    function toggleDynamicCompetent() {
        showDynamicComponent.value = !showDynamicComponent.value;
    }

    function addItem1() {
        items1.value = [...items1.value, items1.value.length + 1];
        // items.value = [items.value.length + 1, ...items.value];
    }

    function removeItem1() {
        items1.value.pop();
        items1.value = [...items1.value];
    }

    function addItem2() {
        items2.value = [...items2.value, 'Test'];
    }

    function removeItem2() {
        items2.value.pop();
        items2.value = [...items2.value];
    }

    return (
        <div>
            <a href='https://vite.dev' target='_blank'>
                <img src={viteLogo} className='logo' alt='Vite logo' />
            </a>
            <a href='https://www.typescriptlang.org/' target='_blank'>
                <img src={typescriptLogo} className='logo vanilla' alt='TypeScript logo' />
            </a>
            <h1>Vite + TypeScript</h1>
            <div className='card'>
                <div style={{ display: 'flex', flexFlow: 'column', gap: '0.5rem' }}>
                    <span>Test Components:</span>
                    <Counter ref={counter} />
                    <button onClick={() => counter.value?.increment()}>Increment Counter</button>
                    <Input type='text' focus={true} value='Input with focus' />
                    <AsyncComponent />
                    <Fragments />
                    <button onClick={toggleDynamicCompetent}>Toggle Dynamic Component</button>
                    <div style={{ display: 'flex', flexFlow: 'row', gap: '0.5rem' }}>
                        <button onClick={addItem1}>Add Dynamic Child 1</button>
                        <button onClick={addItem2}>Add Dynamic Child 2</button>
                    </div>
                    <div style={{ display: 'flex', flexFlow: 'row', gap: '0.5rem' }}>
                        <button onClick={removeItem1}>Remove Dynamic Child 1</button>
                        <button onClick={removeItem2}>Remove Dynamic Child 2</button>
                    </div>
                </div>
            </div>
            <div className='card'>
                <div style={{ display: 'flex', flexFlow: 'column', gap: '0.5rem' }}>
                    <span>Dynamic Components:</span>
                    <Show when={showDynamicComponent}>
                        <LifecycleComponent name='Cached'>
                            Cached {createTimer()}
                        </LifecycleComponent>
                    </Show>
                    <Show when={showDynamicComponent} cache={false}>
                        <LifecycleComponent name='Fresh'>
                            Fresh {createTimer()}
                        </LifecycleComponent>
                    </Show>
                    <Show when={showDynamicComponent}>
                        {() => (
                            <LifecycleComponent name='Callback Cached'>
                                Callback Cached {createTimer()}
                            </LifecycleComponent>
                        )}
                    </Show>
                    <Show when={showDynamicComponent} cache={false}>
                        {() => (
                            <LifecycleComponent name='Callback Fresh'>
                                Callback Fresh {createTimer()}
                            </LifecycleComponent>
                        )}
                    </Show>
                    <With value={switchValue}>
                        {(switchValue) => (
                            <>
                                {switchValue % 3 === 0 && 'yay!'}
                                {switchValue % 3 === 1 && 'wow!'}
                                {switchValue % 3 === 2 && 'lol!'}
                            </>
                        )}
                    </With>
                    <ParentComponent>
                        <For of={items1}>
                            {(item, index) => <span>{index}. Item: {item} {createTimer()}</span>}
                        </For>
                        <>
                            <For of={items2}>
                                {(item, index) => <span>{index}. Item: {item} {createTimer()}
                                </span>}
                            </For>
                        </>
                    </ParentComponent>
                </div>
                <template shadowRootMode='open'>
                    <button>test</button>
                </template>
            </div>
            <p className='read-the-docs'>
                Click on the Vite and TypeScript logos to learn more
            </p>
        </div>
    );
};

const root = document.querySelector<HTMLDivElement>('#app')!;
render(root, <App />);
