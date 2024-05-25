import { IUserInput, QuestionChain, QuestionChoice } from './types';

export class BaseUserInput implements IUserInput {

    constructor() {        
    }

    protected async prompt(question:QuestionChain):Promise<string | undefined> {
        throw new Error("Method not implemented");
    }

    async ask(question:QuestionChain):Promise<string | undefined> {

        if( question.type==='list' ) {
            let choice:QuestionChoice | undefined;
            const chosen = await this.prompt(question);
            if( !chosen ) {
                // User entered nothing - abort
                return;
            }
            choice = question.choices.find(x => x.type==='choice' && x.name===chosen);
            if( !choice || choice.type!=='choice' ) throw new Error("noop - typeguard");

            if( choice.next ) {
                return this.ask(choice.next);
            } else {
                return choice.name;
            }
        } else if( question.type==='input') {
            return this.prompt(question);
        }
    }

    close() {
        
    }
}