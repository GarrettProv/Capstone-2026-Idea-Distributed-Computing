import { compressBrotliSync } from "node:zlib/iter";
import {parseFunction} from "./parse-function";

export type Token =
    | { type: "identifier"; value: string }
    | { type: "number"; value: string }
    | { type: "operator"; value: string }
    | { type: "punctuation"; value: string }
    | { type: "call"; value: string}

export type NestedTokenArray = Token | NestedTokenArray[];

export type Expression =
    | { type: "number"; value: number }
    | { type: "variable"; name: string }
    | { type: "index"; collection: Expression; index: Expression }
    | { type: "call"; name: string; argument: Expression }
    | { type: "multiply"; left: Expression; right: Expression }
    | { type: "divide"; left: Expression; right: Expression }
    | { type: "add"; left: Expression; right: Expression }
    | { type: "subtract"; left: Expression; right: Expression }
    | { type: "lessThanOrEqual"; left: Expression; right: Expression }
    | { type: "greaterThanOrEqual"; left: Expression; right: Expression }
    | { type: "equal"; left: Expression; right: Expression };
    //Will add more but for the time now this is good enough

type ParsedSubExpression = Token | Expression | ParsedSubExpression[];

const operationLevel: Record<string, number> = {
    "<": 1,
    ">": 1,
    ">=": 1,
    "<=": 1,
    "=": 1,

    "+": 2,
    "-": 2,

    "*": 3,
    "/": 3
}

/// Example for A Sum function Sum(X[i] * weights[i]):
/*
{
    type: "call",
    name: "Sum",
    argument: {
        type: "multiply",
        left: {
            type: "index",
            collection: { type: "variable", name: "X" },
            index: { type: "variable", name: "i" }
        },
        right: {
            type: "index",
            collection: { type: "variable", name: "weights" },
            index: { type: "variable", name: "i" }
        }
    }
};
*/


export function parseConstraints(constraints: string[]){
    const tokens = tokenize(constraints[0]); //Set to one thing rn for testing
        // Next: parse these tokens into an Expression tree.
    return parseExpression(tokens);
}


function parseExpression(tokens: Token[]){ //Will Change Return
    const splitTokens = splitTokensByLevel3Operations(
        splitTokensByLevel2Operations(
            splitTokensByLevel1Operations(
                combineFunctionOperationsFromTokenize(tokens)
            )
        )
    );

    return parseSubExpression(splitTokens);
}

function parseSubExpression(input: NestedTokenArray | Expression): ParsedSubExpression {
    console.log("\n\nParsing SubExpression:", input);
    if (!Array.isArray(input)) {
        if (input.type === "number") {
            return {
                type: "number",
                value: Number(input.value)
            }
        } else if(input.type === "identifier") {
            return {
                type: "variable",
                name: input.value
            }
        } else if(input.type === "operator") {
            if(input.value === "*") {
                return input; //Placeholder
            }
        } else if (input.type === "call" && "value" in input) {
            const openParen = input.value.indexOf("(");
            const name = input.value.slice(0, openParen);
            const argumentText = input.value.slice(openParen + 1, -1);

            const argumentTokens = tokenize(argumentText);
            const argument = parseExpression(argumentTokens);

            return {
                type: "call",
                name,
                argument: argument as Expression
            };
        } else {
            return input; // Return the token as is for operators and punctuation.
        }
    } else {
        const parsedParts = input.map(part => parseSubExpression(part));

        // Unwrap a group containing just one parsed item, such as [B].
        if (parsedParts.length === 1) {
            return parsedParts[0];
        }

        // Combine alternating operand/operator groups from left to right.
        if (parsedParts.length >= 3 && parsedParts.length % 2 === 1 && isExpression(parsedParts[0])) {
            let result = parsedParts[0];

            for (let i = 1; i < parsedParts.length; i += 2) {
                const operator = parsedParts[i];
                const right = parsedParts[i + 1];
                if (Array.isArray(operator) || operator.type !== "operator" || !isExpression(right)) {
                    return parsedParts;
                }

                if (operator.value === "*") {
                    result = { type: "multiply", left: result, right };
                } else if (operator.value === "+") {
                    result = { type: "add", left: result, right };
                } else if (operator.value === "-") {
                    result = { type: "subtract", left: result, right };
                } else if (operator.value === "/") {
                    result = { type: "divide", left: result, right };
                } else if (operator.value === ">=") {
                    result = { type: "greaterThanOrEqual", left: result, right };
                } else {
                    return parsedParts;
                }
            }

            return result;
        }

        // TODO: Combine addition, division, and comparison groups.
        return parsedParts;
    }

    return input; // Fallback return for unhandled cases.
}

function isExpression(value: ParsedSubExpression): value is Expression {
    if (Array.isArray(value)) return false;

    switch (value.type) {
        case "number": return typeof value.value === "number";
        case "variable": return "name" in value;
        case "index": return "collection" in value;
        case "call": return "name" in value && "argument" in value;
        case "multiply":
        case "divide":
        case "lessThanOrEqual": return "left" in value && "right" in value;
        case "add": return "left" in value && "right" in value;
        case "subtract": return "left" in value && "right" in value;
        case "greaterThanOrEqual": return "left" in value && "right" in value;
        case "equal": return "left" in value && "right" in value;
        default: return false;
    }
}

export function splitTokensByLevel3Operations(tokens: NestedTokenArray): NestedTokenArray{
    if (!Array.isArray(tokens)) return tokens;

    // A flat token group can be split at level 3; nested groups are handled recursively.
    if (tokens.length > 0 && !Array.isArray(tokens[0])) {
        const tokenGroup = tokens as Token[];
        let final: NestedTokenArray[] = [];
        let group: Token[] = [];

        for (const token of tokenGroup) {
            if (operationLevel[token.value] === 3) {
                final.push(group);
                group = [];
                final.push([token]);
            } else {
                group.push(token);
            }
        }

        if (group.length > 0) final.push(group);
        return final;
    }

    return tokens.map(token => splitTokensByLevel3Operations(token));
}

export function splitTokensByLevel2Operations(tokens: (Token[] | Token)[]): NestedTokenArray{
    let final: NestedTokenArray[] = [];
    for (const part of tokens) {
        if (!Array.isArray(part)) {
            final.push(part);
            continue;
        }

        const row: NestedTokenArray[] = [];
        let group: Token[] = [];
        for (const token of part) {
            if (operationLevel[token.value] === 2) {
                row.push(group, [token]);
                group = [];
            } else {
                group.push(token);
            }
        }
        if (group.length > 0) row.push(group);
        final.push(row);
    }

    return final;
}

export function splitTokensByLevel1Operations(tokens: Token[]): (Token[] | Token)[]{
    let level1OperationCount = 0;
    let level1OperationIndex = 0;
    for(let i = 0; i < tokens.length; i++){
        if(operationLevel[tokens[i].value] && operationLevel[tokens[i].value] == 1){
            level1OperationCount++;
            level1OperationIndex = i;
        }
    } //TODO add error handling for more then 1 level 1 operation
    if(level1OperationCount === 0){
        return [tokens];
    }
    return [
        tokens.slice(0, level1OperationIndex),
        tokens[level1OperationIndex],
        tokens.slice(level1OperationIndex + 1)
    ];

}

export function combineFunctionOperationsFromTokenize(tokens: Token[]): Token[]{
    let combinedTokens: Token[] = [];
    let currentIndex = 0;
    for(let i = 0; i < tokens.length; i++){
        if(tokens[i].type === "identifier" && tokens[i+1] && (tokens[i+1].value === "(" || tokens[i+1].value === "[")){
            //Must be some sort of function or some index value
            if(combinedTokens[currentIndex] && combinedTokens[currentIndex].type === "call"){
                combinedTokens[currentIndex].value += tokens[i].value;
            }
            else {
                combinedTokens[currentIndex] = {
                    type: "call",
                    value: tokens[i].value
                }
            }

            i++;
            if(tokens[i].value === "("){
                while(tokens[i].value != ")"){
                    combinedTokens[currentIndex].value += tokens[i].value;
                    i++;
                }
            } else {
                while(tokens[i].value != "]"){
                    combinedTokens[currentIndex].value += tokens[i].value;
                    i++;
                }
            }


            combinedTokens[currentIndex].value += tokens[i].value;
            currentIndex++;

        } else {
            combinedTokens[currentIndex] = {
                type: tokens[i].type,
                value: tokens[i].value
            }
            currentIndex++;
        }
    }

    return combinedTokens;

}

//Splits stuff into tokens to parse
export function tokenize(input: string): Token[] {
    const pattern = /\s*(<=|>=|==|[A-Za-z_]\w*|\d+(?:\.\d+)?|[()+\-*/[\],])\s*/gy;
    const tokens: Token[] = [];
    let position = 0;

    while (position < input.length) {
        pattern.lastIndex = position;
        const match = pattern.exec(input);

        if (!match) {
            throw new Error(`Unexpected character at position ${position}`);
        }

        const text = match[1];

        if (/^\d/.test(text)) {
            tokens.push({ type: "number", value: Number(text) });
        } else if (/^[A-Za-z_]/.test(text)) {
            tokens.push({ type: "identifier", value: text });
        } else if ("()[],".includes(text)) {
            tokens.push({ type: "punctuation", value: text });
        } else {
            tokens.push({ type: "operator", value: text });
        }

        position = pattern.lastIndex;
    }

    return tokens;
}
