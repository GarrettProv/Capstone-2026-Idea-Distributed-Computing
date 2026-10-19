export function parseConstraints(constraints: string[]){
    type Expression =
        | { type: "number"; value: number }
        | { type: "variable"; name: string }
        | { type: "index"; name: string; index: Expression }
        | { type: "add"; left: Expression; right: Expression }
        | { type: "function"; name: string; argument: Expression };

    const tree: Expression = {
        type: "function",
        name: "Sum",
        argument: {
            type: "add",
            left: {
                type: "index",
                name: "X",
                index: { type: "variable", name: "i" }
            },
            right: { type: "number", value: 3 }
        }
    };
}


type Token =
    | { type: "identifier"; value: string }
    | { type: "number"; value: number }
    | { type: "operator"; value: string }
    | { type: "punctuation"; value: string };
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
        } else if ("()+-*/[],".includes(text)) {
            tokens.push({ type: "punctuation", value: text });
        } else {
            tokens.push({ type: "operator", value: text });
        }

        position = pattern.lastIndex;
    }

    return tokens;
}

console.log(tokenize("Sum(X[i] * weights[i]) <= capacity"));