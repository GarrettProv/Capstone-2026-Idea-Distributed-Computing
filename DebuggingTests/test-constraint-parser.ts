import { tokenize, combineFunctionOperationsFromTokenize, splitTokensByLevel1Operations, splitTokensByLevel2Operations, splitTokensByLevel3Operations, type NestedTokenArray } from "../src/GA Problem Parsing Files/parse-constraints";

const string = "Y[i] - j + X[i] * Apple[i] + 3 >= 5";
const tokens = tokenize(string);
const combinedTokens = combineFunctionOperationsFromTokenize(tokens);
const level1 = splitTokensByLevel1Operations(combinedTokens);
const level2 = splitTokensByLevel2Operations(level1);
const level3 = splitTokensByLevel3Operations(level2);

function formatTokens(value: NestedTokenArray, indent = 0): string[] {
    if (!Array.isArray(value)) {
        return [" ".repeat(indent) + value.value];
    }

    if (value.length > 0 && !Array.isArray(value[0])) {
        const tokenGroup = value.map(token => (token as { value: string }).value).join(" ");
        return [" ".repeat(indent) + (tokenGroup || "(empty group)")];
    }

    return value.flatMap(group => formatTokens(group, indent + 2));
}

console.log(`Constraint: ${string}`);
console.log("\nTokens:");
console.log(tokens.map(token => token.value).join(" "));
console.log("\nAfter combining function/index tokens:");
console.log(combinedTokens.map(token => token.value).join(" "));
console.log("\nAfter level 1 split:");
console.log(formatTokens(level1).join("\n"));
console.log("\nAfter level 2 split:");
console.log(formatTokens(level2).join("\n"));
console.log("\nAfter level 3 split:");
console.log(formatTokens(level3).join("\n"));

