import { pgqFileReaderNode } from "../utils/pgqFileReaderNode";
import { cli } from "./cli";
import { UserInputNode } from "./utils/user-input/UserInputNode";

async function main() {
    const userInput = new UserInputNode();

    cli(userInput, pgqFileReaderNode)
    
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
