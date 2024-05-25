
export type QuestionChoice = {
    type: 'choice',
    name: string,
    next?: QuestionChain
} | {
    type: 'separator'
}
type BaseQuestionChain = {
    name: string,
    message: string,
    validate?: (input: any) => string | boolean | Promise<string | boolean>
    filter?: (input: string) => string | Promise<string>
}
export type QuestionChain = BaseQuestionChain & {
    type: 'list',
    choices: QuestionChoice[],
} | BaseQuestionChain & {
    type: 'input',
}

export interface IUserInput {
    ask(questionChain: QuestionChain): Promise<string | undefined>;
    close(): void;
}