import './style.css';
import viteLogo from '/vite.svg';
import { createObservable, type FunctionalComponent, render } from '@lib/plain-jsx';
import type { VNode } from '../../../packages/plain-jsx/dist/types/types';
import { AsyncComponent } from './components/AsyncComponent';
import { Counter, type CounterRefType } from './components/Counter';
import { Fragments } from './components/Fragments';
import { Input } from './components/Input';
import { LifeTimeComponent } from './components/LifeTimeComponent';
import typescriptLogo from './typescript.svg';

const App: FunctionalComponent = () => {
    const dynamicComponent = createObservable<VNode | null>(null);
    const counter = createObservable<CounterRefType | null>(null);

    function toggleDynamicCompetent() {
        dynamicComponent.value = dynamicComponent.value ? null : <LifeTimeComponent />;
        counter.value?.increment();
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
                <Counter ref={counter} />
                <Input type='text' focus={true} />
                <AsyncComponent />
                <Fragments />
            </div>
            <div className='card'>
                <button onClick={toggleDynamicCompetent}>Toggle Dynamic Component</button>
                {dynamicComponent}
            </div>
            <p className='read-the-docs'>
                Click on the Vite and TypeScript logos to learn more
            </p>
        </div>
    );
};

const root = document.querySelector<HTMLDivElement>('#app')!;
render(root, <App />);
