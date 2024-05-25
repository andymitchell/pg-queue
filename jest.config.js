
module.exports = {

    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        // Use babel-jest to transform JS files
        '^.+\\.(js|jsx)$': 'babel-jest',
        '^.+getCurrentDirectory\\.ts$': 'babel-jest',
        // Use ts-jest for ts/tsx files
        '^.+\\.(ts|tsx)$': 'ts-jest',
    },
    transformIgnorePatterns: [
        // Don't transform node_modules for any other ES modules you use
        '/node_modules/(?!lodash-es|dot-prop|\@electric\-sql\/pglite|pkg-dir|find-up-simple|inquirer|chalk|ansi-styles|filenamify|filename-reserved-regex)'
    ],
    moduleNameMapper: {
        '^#ansi-styles$': 'ansi-styles'
    },
    maxConcurrency: 10,
    setupFiles: ['./jest.setup.js']


};
