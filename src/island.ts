import { createConnection } from "node:net";

const workerId = process.argv[2] ?? "island-1";
const jobsQueue: any[] = [];
let currentJobId: string | null = null;

let heartbeat = true; //Debug Flag to sim failures

let jobPopulationSize = 10;
let exchangeRate = 3; //Exchange best canadidates every 3 generations

let waitingForExchange:
    | {
        jobId: string;
        resolve: (candidate: string) => void;
      }
    | undefined;

const socket = createConnection(
    {
        host: "127.0.0.1",
        port: 3000
    },
    () => {
        console.log("Connected to coordinator");

        const registerMessage = {
            type: "REGISTER",
            workerId: workerId,
            workerType: "island"
        };

        socket.write(
            JSON.stringify(registerMessage) + "\n"
        );

        const HEARTBEAT_INTERVAL_MS: number = 5000;

        sendHeartbeat();

        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);


    }
);


let buffer = "";
socket.on("data", (data) => { //Get any data from coordinator
    console.log(
        "Message from coordinator:",
        data.toString().trim()

       
    ); 
    // TCP gives us bytes, so turn them into text
    buffer += data.toString();

    // Each Atlas message will end with a newline
    let newlineIndex;

    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.trim() === "") {
            continue;
        }

        const message = JSON.parse(line); // Get the connection message

        if(message.type === "RUN_JOB") {
            console.log(`Received job: ${message.jobId}`);
            jobsQueue.push(message);
            sendHeartbeat();
            startNextJob();
        }

        if (message.type === "BEST_CANDIDATE_EXCHANGE" && waitingForExchange) {
            if (message.jobId === waitingForExchange.jobId) {
                waitingForExchange.resolve(message.newBestCandidate);
                waitingForExchange = undefined;
            }
        }

        if (message.type === "DISCONNECT") {
            console.log(`Received disconnect message from coordinator: ${message.reason}`);
            socket.end();
        }

    }


});

function getRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function score(candidate: string): number {
    return candidate.split("").filter(bit => bit === "1").length;
}

async function startNextJob(): Promise<void> {
    if (currentJobId !== null || jobsQueue.length === 0) {
        return;
    }

    const message = jobsQueue.shift();
    if (!message) return;
    currentJobId = message.jobId;

    socket.write(JSON.stringify({
        type: "STARTING_JOB",
        workerId,
        jobId: message.jobId
    }) + "\n");

    console.log(`Starting job: ${message.jobId}`);

    const finishJob = (result: unknown): void => {
        const jobResult = {
            type: "JOB_RESULT",
            workerId,
            jobId: message.jobId,
            result
        };

        console.log(`Sending result for ${message.jobId}: ${result}`);
        socket.write(JSON.stringify(jobResult) + "\n");
        currentJobId = null;
        sendHeartbeat();
        startNextJob();
    };

    if (message.kind === "OneMax") {

        if(message.groupJob){
            //Will be running this in parallel with other islands]
            //Every 3 generations send a message to the coordinator saying we finished
            //a cycle and then send out best canadidate and wait for coordinator to send back best candidates from other islands
        }
        const { bitLength, genAmount, populationSize, islandAmount, jobLength } = message.input;
        if (!Number.isInteger(bitLength) || bitLength < 1 ||
            !Number.isInteger(genAmount) || genAmount < 0 ||
            !Number.isInteger(populationSize) || populationSize < 2 ||
            !Number.isFinite(jobLength) || jobLength < 0) {
            finishJob("Invalid OneMax parameters");
            return;
        }

        jobPopulationSize = populationSize;
        console.log(`Received OneMax job with bit length ${bitLength}, generations ${genAmount}, population size ${populationSize}`);
        let population = Array.from({ length: populationSize }, () =>
            Array.from({ length: bitLength }, () => getRandomInt(0, 1)).join("")
        );
        let bestCandidate = population[0];

        for (let generation = 0; generation < genAmount && score(bestCandidate) < bitLength; generation++) {
            if(message.groupJob && generation > 0 && generation % exchangeRate === 0){
                //Send best candidate to coordinator and wait for best candidates from other islands
                const newCandidatePromise = new Promise<string>((resolve) => {
                    waitingForExchange = {
                        jobId: message.jobId,
                        resolve
                    };
                });

                socket.write(JSON.stringify({
                    type: "EXCHANGE_BEST_CANDIDATE",
                    workerId,
                    jobId: message.jobId,
                    bestCandidate
                }) + "\n");

                const newCandidate = await newCandidatePromise;
                console.log(`Received new candidate: ${newCandidate}`);
                
            }
            population = beginGeneration(population, bitLength);
            const generationBest = population.reduce((best, candidate) =>
                score(candidate) > score(best) ? candidate : best
            );
            if (score(generationBest) > score(bestCandidate)) bestCandidate = generationBest;
            console.log(`Generation ${generation + 1}: best ${bestCandidate}, score ${score(bestCandidate)}/${bitLength}`);
        }

        setTimeout(() => finishJob(score(bestCandidate)), jobLength);
    }
}

function beginGeneration(population: string[], bitLength: number): string[] {
    const rankedPopulation = population
        .map((candidate, index) => ({ candidate, index, fitness: score(candidate) }))
        .sort((a, b) => b.fitness - a.fitness);
    const nextGeneration = [rankedPopulation[0].candidate]; // Keep the best candidate.

    while (nextGeneration.length < jobPopulationSize) {
        const parent1 = selectRandomCandidate(rankedPopulation, 0.8);
        const parent2 = selectRandomCandidate(rankedPopulation, 0);
        let child = "";
        for (let bit = 0; bit < bitLength; bit++) {
            child += getRandomInt(0, 1) === 1 ? parent1[bit] : parent2[bit];
        }

        // Give each child a 10% chance of one bit flip.
        if (getRandomInt(0, 99) < 10) {
            const mutationIndex = getRandomInt(0, bitLength - 1);
            child = child.substring(0, mutationIndex) +
                (child[mutationIndex] === "0" ? "1" : "0") +
                child.substring(mutationIndex + 1);
        }
        nextGeneration.push(child);
    }
    return nextGeneration;
}

function selectRandomCandidate(
    rankedPopulation: { candidate: string; index: number; fitness: number }[],
    topFraction: number
): string {
    const eligibleCount = Math.max(1, Math.ceil(rankedPopulation.length * (1 - topFraction)));
    return rankedPopulation[getRandomInt(0, eligibleCount - 1)].candidate;
}


function sendHeartbeat(): void {
    const heartbeatMessage = {
        type: "HEARTBEAT",
        workerId,
        currentTime: new Date().toISOString(),
        currentAmountOfJobs: jobsQueue.length + (currentJobId === null ? 0 : 1),
        jobsQueueDebug: jobsQueue.map(job => job.jobId), // Debug information about the jobs in the queue
        currentJobId: currentJobId
    };

    console.log("Sent Heartbeat Message");
    if (heartbeat) {
        socket.write(JSON.stringify(heartbeatMessage) + "\n");
    }
}

socket.on("close", () => {
    console.log("Disconnected from coordinator");
});

socket.on("error", (error) => {
    console.log("Connection error:", error.message);
});
