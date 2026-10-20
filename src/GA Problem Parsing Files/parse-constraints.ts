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
    | { type: "lessThanOrEqual"; left: Expression; right: Expression }
    | { type: "equal"; left: Expression; right: Expression };
    //Will add more but for the time now this is good enough

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


export function parseConstraints(constraints: string[]): Expression[]{
    return constraints.map(constraint => {
        const tokens = tokenize(constraint);
        // Next: parse these tokens into an Expression tree.
        return parseExpression(tokens);
    });
}


function parseExpression(tokens: Token[]): Expression{
    let splitTokens = splitTokensByOperations;
    for (let i = 0; i < tokens.length; i++) {
        if(tokens[i].type === "identifier"){
            if(tokens[i+1].type === "punctuation" && tokens[i+1].value === "("){
                //We know this identifier is in the form of a function 
                let j = i + 2;
                let functionTokenList: Token[] = [];
                while(tokens[j].value != ")"){
                    functionTokenList.push(tokens[j]);
                    j++;
                }
                return(parseFunction(tokens[i], parseExpression(functionTokenList)));
            }
            //TODO error handling if function not set up correctly
        }
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

export function splitTokensByLevel2Operations(tokens: Token[][]): NestedTokenArray{
    let final: NestedTokenArray[] = [];
    let level2OperationIndexs: number[][] = [];
    for(let i = 0; i < tokens.length; i++){
        let counter = 0;
        for(let j = 0; j < tokens[i].length; j++){
            if(operationLevel[tokens[i][j].value] && operationLevel[tokens[i][j].value] == 2){
                if(level2OperationIndexs[i]){
                    level2OperationIndexs[i][counter] = j;
                } else {
                    level2OperationIndexs[i] = [];
                    level2OperationIndexs[i][counter] = j;
                }

                counter ++;
            }
        }
    }

    for(let i = 0; i < tokens.length; i++){
        let row: NestedTokenArray[] = [];
        let group: Token[] = [];
        let operationIndex = 0;
        for(let j = 0; j < tokens[i].length; j++){
            const token = tokens[i][j];
            if(level2OperationIndexs[i]?.[operationIndex] === j){
                row.push(group);
                group = [];
                row.push([token]);
                operationIndex++;
            } else {
                group.push(token);
            }
        }
        if(group.length > 0) row.push(group);
        final[i] = row;
    }

    return final;


}

export function splitTokensByLevel1Operations(tokens: Token[]): Token[][]{
    let level1OperationCount = 0;
    let level1OperationIndex = 0;
    let final: Token[][] = [[],[],[]];
    for(let i = 0; i < tokens.length; i++){
        if(operationLevel[tokens[i].value] && operationLevel[tokens[i].value] == 1){
            level1OperationCount++;
            level1OperationIndex = i;
        }
    } //TODO add error handling for more then 1 level 1 operation
    for(let i = 0; i < tokens.length; i++){
        if(i < level1OperationIndex){
            final[0][i] = {
                type: tokens[i].type,
                value: tokens[i].value
            }
        } else if(i == level1OperationIndex){
            final[1][0] = {
                type: tokens[i].type,
                value: tokens[i].value
            }
        } else {
            final[2][i - level1OperationIndex - 1] = {
                type: tokens[i].type,
                value: tokens[i].value
            }
        }
    }
    return final;

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
