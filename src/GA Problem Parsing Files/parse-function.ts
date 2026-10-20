import type {Expression, Token} from "./parse-constraints"

export function parseFunction(functionName: Token, functionInput: Expression): Expression{
    if(functionName.value === "Sum"){
        //We know we have the sum function

        //TODO ad some error handling if the input is not correct for SUM

        //Right now just return the arguemnt:
        const sumFunction: Expression = {
            type: "call",
            name: "sum",
            argument: functionInput
        }
        return sumFunction;
    }
    let empty: Expression = { //Placeholder 
        type: "call",
        name: "sum",
        argument: functionInput 
    }
    return empty;
}