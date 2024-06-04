#!/usr/bin/env node

import { UserInputNode, fileIoNode } from "@andyrmitchell/file-io";
import { cli } from "./cli";


async function main() {
    const userInput = new UserInputNode();

    cli(userInput, fileIoNode)
    
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
