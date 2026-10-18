
// Each representation has its own shape. Add a new variant here when its
// candidate format and genetic operators are ready to be implemented.
export type VectorRepresentation = {
    type: "vector",
    length: number,
    elementType: "integer" | "real",
    domain: [number, number]
}

export type PermutationRepresentation = {
    type: "permutation",
    elements: (string | number)[]
}

export type Representation = VectorRepresentation | PermutationRepresentation

export type Candidate = {
    representation: Representation
}

export type Objectives = {
    direction: "max" | "min",
    evaluation: string
}

export type GeneticAlgorithmSettings = {
    populationSize: number,
    maxGenerations: number,
    mutationRate: number, // Probability from 0 to 1
    maxGenerationAttempts: number // Stop if it is too hard to generate valid candidates
}

export type GeneticProblem = {
    data: Record<string, number | number[]>,
    settings: GeneticAlgorithmSettings,
    candidate: Candidate,
    constraints: string[],
    objectives: Objectives
}

// Type guard for VectorRepresentation
export function isVectorRepresentation(
    representation: Representation
): representation is VectorRepresentation {
    return representation.type === "vector";
}

// Type guard for PermutationRepresentation
export function isPermutationRepresentation(
    representation: Representation
): representation is PermutationRepresentation {
    return representation.type === "permutation";
}

/* Example problem description:
{
    data: {
        weights: [4,5,6,7,1]
        values: [20, 8, 13, 2, 1]
        capacity: 20
    }
    settings: {
        populationSize: 50,
        maxGenerations: 100,
        mutationRate: 0.1,
        maxGenerationAttempts: 1000
    }
    candidate: {
        representation: {
            type: "vector",
            length: 5,
            elementType: "integer",
            domain: [0, 1]
        }
    }
    constraints: [
        "Sum(X[i] * weights[i]) <= capacity"
    ]
    objectives: {
        direction: max
        evaluation: "Sum(X[i] * values[i])"
    }
}
*/
