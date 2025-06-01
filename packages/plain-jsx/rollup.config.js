import baseConfig from '@lib/rollup-config/lib';

export default [
    {
        ...baseConfig,
        input: {
            'index': 'src/index.ts',
            'jsx-runtime': 'src/jsx-runtime.ts',
            'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
        },
        external: ['@lib/utils'],
        output: [
            {
                dir: 'dist',
                format: 'esm',
                entryFileNames: '[name].esm.js',
                preserveModules: true,
            },
        ],
    },
    {
        ...baseConfig,
        input: 'src/index.ts',
        external: ['@lib/utils'],
        output: [
            {
                name: 'PlainJSX',
                format: 'iife',
                globals: { '@lib/utils': 'Utils' },
                file: './dist/index.iife.js',
            },
        ],
    },
];
