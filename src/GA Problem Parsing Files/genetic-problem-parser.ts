import { read } from "node:fs";
import type { GeneticProblem, Representation } from "../genetic-algorithm";
import { isVectorRepresentation, isPermutationRepresentation } from "../genetic-algorithm";
import { parseConstraints } from "./parse-constraints"



type GAReadyVectorRepresentation = {
    type: "vector",
    length: number,
    elementType: "integer" | "real",
    domain: [number, number]
}

type GAReadyPermutationRepresentation = {
    type: "permutation",
    elements: (string | number)[]
}


type GAReadyProblem = {
    data: Record<string, number | number[]>,
    candidate: GAReadyPermutationRepresentation | GAReadyVectorRepresentation | undefined,
    constraints: string[], //Computer Readable Form
    objectives: {
        direction: string,
        evaluation: string //Comp Readable Form
    }

}

function handleProblemType(){

}


/** Accepts a problem description and returns its parsed form. */
export function parseGeneticProblem(problem: GeneticProblem): GAReadyProblem {
    const data = problem.data;
    const constraints = problem.constraints;
    const objectives = problem.objectives;

    let readyProblem: GAReadyProblem = {
        data: {},
        candidate: undefined,
        constraints: [],
        objectives: {
            direction: "",
            evaluation: ""
        }
    }

    //Parse Data
    readyProblem.data = parseData(data);

    //Parse Candidate
    const representation = problem.candidate.representation;
    readyProblem.candidate = parseCanadiate(representation)

    // Handle Parsing Constraints
    const parsedConstraints = parseConstraints(constraints);
    
     

    return readyProblem;
}
// #region Parising Data
function parseData(data: Record<string, number | number[]>): Record<string, number | number[]> {
    //Start with parsing Data
    let finalData: Record<string, number | number[]> = {};
    for (const [key, value] of Object.entries(data)) {
        finalData[key] = value;
    } // Currently just copy the whole data over
    return finalData;
}
// #endregion


function parseCanadiate(representation: Representation): GAReadyPermutationRepresentation | GAReadyVectorRepresentation | undefined{
    if (isVectorRepresentation(representation)) {
        return {
            type: "vector",
            length: representation.length,
            elementType: representation.elementType,
            domain: representation.domain
        };
    } else if(isPermutationRepresentation(representation)){ //Handle Permutation Candidate
        return {
            type: "permutation",
            elements: representation.elements
        };
    }
}
