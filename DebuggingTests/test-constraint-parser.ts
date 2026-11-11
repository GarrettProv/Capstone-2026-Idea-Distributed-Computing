import { tokenize, parseConstraints, combineFunctionOperationsFromTokenize, splitTokensByLevel1Operations, splitTokensByLevel2Operations, splitTokensByLevel3Operations, type NestedTokenArray } from "../src/GA Problem Parsing Files/parse-constraints";

const bracketColors = ["\x1b[36m", "\x1b[33m", "\x1b[35m", "\x1b[32m"];
const resetColor = "\x1b[0m";

const string = "Sum(X/10)>= 0";
const tokens = tokenize(string);
const combinedTokens = combineFunctionOperationsFromTokenize(tokens);
const level1 = splitTokensByLevel1Operations(combinedTokens);
const level2 = splitTokensByLevel2Operations(level1);
const level3 = splitTokensByLevel3Operations(level2);
const parseConstraintsResult = parseConstraints([string]);

function formatTokens(value: NestedTokenArray, depth = 0): string {
    if (!Array.isArray(value)) {
        return value.value;
    }

    const color = bracketColors[depth % bracketColors.length];
    if (value.every(item => !Array.isArray(item))) {
        const tokenGroup = value.map(token => (token as { value: string }).value).join(" ");
        return `${color}[${tokenGroup || "empty"}]${resetColor}`;
    }

    return `${color}[${resetColor} ${value.map(group => formatTokens(group, depth + 1)).join("     ")} ${color}]${resetColor}`;
}

console.log(`Constraint: ${string}`);
console.log("\nTokens:");
console.log(tokens.map(token => token.value).join(" "));
console.log("\nAfter combining function/index tokens:");
console.log(combinedTokens.map(token => token.value).join(" "));
console.log("\nPass 1 — comparison split:");
console.log(formatTokens(level1));
console.log("\nPass 2 — addition/subtraction split:");
console.log(formatTokens(level2));
console.log("\nPass 3 — multiplication/division split:");
console.log(formatTokens(level3));


console.log("\nFull recursive split result:");
console.dir(parseConstraintsResult, { depth: null });
