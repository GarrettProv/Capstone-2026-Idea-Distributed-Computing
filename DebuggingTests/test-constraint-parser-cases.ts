import { parseConstraints } from "../src/GA Problem Parsing Files/parse-constraints";

const cases = [
    "A + B * C >= 0",
    "6 + B * 7 + 7 >= 0",
    "A - B - C <= D",
    "A / B > 2",
    "A < B",
    "A == B",
    "Sum(X)",
    "Sum(X[i] * weights[i]) >= capacity"
];

for (const input of cases) {
    console.log(`\nInput: ${input}`);
    const originalLog = console.log;
    try {
        // parseSubExpression has its own WIP tracing; suppress it to keep this summary readable.
        console.log = () => {};
        const result = parseConstraints([input]);
        console.log = originalLog;
        console.log("Parsed output:");
        console.dir(result, { depth: null });
    } catch (error) {
        console.log = originalLog;
        console.error("Parser threw an error:", error);
    }
}
