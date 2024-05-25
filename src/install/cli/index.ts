import { sqlFilterReaderNode } from "../utils/sqlFileReaderNode";
import { cli } from "./cli";
import { UserInputNode } from "./utils/user-input/UserInputNode";

async function main() {
    const userInput = new UserInputNode();

    cli(userInput, sqlFilterReaderNode)
    
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
