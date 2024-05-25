
module.exports = {
    presets: [
        ['@babel/preset-env', {
            targets: { node: 'current' },
        }], // Target the current version of Node.js
        '@babel/preset-typescript', // Add TypeScript support
    ],
    "plugins": [
        "babel-plugin-transform-import-meta"
    ]
};