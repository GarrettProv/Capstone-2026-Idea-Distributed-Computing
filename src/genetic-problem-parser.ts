import type { GeneticProblem, Representation } from "./genetic-algorithm";
import { isVectorRepresentation, isPermutationRepresentation } from "./genetic-algorithm";



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
    const candidate = problem.candidate;
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

    //Start with parsing Data
    for (const [key, value] of Object.entries(data)) {
        readyProblem.data[key] = value;
    } // Currently just copy the whole data over

    //Parse Candidate
    const representation = problem.candidate.representation;

    // Handle Vector Candidate
    if (isVectorRepresentation(representation)) {
        readyProblem.candidate = {
            type: "vector",
            length: representation.length,
            elementType: representation.elementType,
            domain: representation.domain
        };
    } else if(isPermutationRepresentation(representation)){ //Handle Permutation Candidate
        readyProblem.candidate = {
            type: "permutation",
            elements: representation.elements
        };
    }

    // Handle Parsing Constraints
    for(let i = 0; i < constraints.length; i++){
        let currentConstraint = "";
        const text = "hello";

        for (let j = 0; j < constraints[i].length; j++) {
        const character = text[i];
        console.log(character);
        }
        
    }
     

    return readyProblem;
}
