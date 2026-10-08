import { createConnection } from "node:net";

const workerId = process.argv[2] ?? "island-1";
const jobsQueue: any[] = [];
let currentJobId: string | null = null;

let heartbeat = true; //Debug Flag to sim failures

let jobPopulationSize = 10;

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


        if (message.type === "DISCONNECT") {
            console.log(`Received disconnect message from coordinator: ${message.reason}`);
            socket.end();
        }

    }


});

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function startNextJob(): void {
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
        let lastGen: Record<string, string> = {};
        const {bitLength, genAmount, populationSize, jobLength} = message.input;
        console.log(`Received OneMax job with bit length ${bitLength}, generations ${genAmount}, population size ${populationSize}`);
        jobPopulationSize = populationSize; // Update the global population size based on the job input
        for(let i = 0; i < jobPopulationSize; i++){
            const randomBinaryString = Array.from({ length: bitLength }, () => getRandomInt(0, 1)).join('');
            lastGen[i] = randomBinaryString;
        }
        console.log(genAmount);
        for(let i = 0; i < genAmount; i++){
            lastGen = beginGeneration("OneMax", i, lastGen, bitLength)
            console.log("lastGen: " + JSON.stringify(lastGen));
            console.log(`Generation ${i} completed. Best candidate: ${lastGen[0]}. Whole generation: ${JSON.stringify(lastGen)}`);
        }
        let bestScore = -1;
        for(let i = 0; i < jobPopulationSize; i++){
            const currentScore = lastGen[i].split("").filter(bit => bit === "1").length;
            if(currentScore > bestScore){
                bestScore = currentScore;
            }
        }

        setTimeout(() => finishJob(bestScore), message.input.jobLength ?? 0);
    }
}

function beginGeneration(kind:string, currentGen:number, lastGen: Record<string, string>, bitLength: number): any{
    if(kind == "OneMax"){
        let currentBest: string = "";

        //score the last generation
        for(let i = 0; i < jobPopulationSize - 1; i++){
            console.log(`Candidate ${i}: ${lastGen[i]} Score: ${lastGen[i].split("").filter(bit => bit === "1").length}`);
            const currentScore = lastGen[i].split("").filter(bit => bit === "1").length;
            const bestScore = currentBest.split("").filter(bit => bit === "1").length;
            if(currentScore > bestScore){
                currentBest = lastGen[i];
            }
        }

        let newGeneration: Record<string, string> = { 0: currentBest }; //Keep best one and generate others
        let lastGenerationFitness: Record<string, number> = {};
        for(let i = 0; i < jobPopulationSize; i++){
            lastGenerationFitness[i] = lastGen[i].split("").filter(bit => bit === "1").length;
        }
        for(let i = 0; i < jobPopulationSize - 1; i++){
            let parent1: number = selectRandomCandidate(lastGenerationFitness, .80);
            let parent2: number = selectRandomCandidate(lastGenerationFitness, 0);
            let child: string = "";
            for(let i = 0; i < bitLength; i++){
                let randomBit:number = getRandomInt(0,1);
                if(randomBit == 1){
                    child += lastGen[parent1][i];
                }else{
                    child += lastGen[parent2][i];
                }
            }
            //Simulate mutation
            let mutationChance: number = getRandomInt(0, 100);
            if(mutationChance < 10){ // 10% mutation rate
                let mutationIndex: number = getRandomInt(0, bitLength - 1);
                child = child.substring(0, mutationIndex) + (child[mutationIndex] === "0" ? "1" : "0") + child.substring(mutationIndex + 1);
            }
            newGeneration[i+1] = child;
        }
        console.log("New Generation: " + JSON.stringify(newGeneration));
        return newGeneration;
    }
}

function selectRandomCandidate(populationFitness:Record<string, number>, topPercent: number): number{
    for(const key in populationFitness){
        //Grab a random candidate from the top percent of the populations fitness
        let possibleCandidates: number[] = [];
        const fitness = populationFitness[key];
        const threshold = Math.floor(topPercent * 100);
        for(const key in populationFitness){
            if(populationFitness[key] >= threshold){
                possibleCandidates.push(Number(key));
            }
        }
        if(possibleCandidates.length > 0){
            const randomIndex = Math.floor(Math.random() * possibleCandidates.length);
            return randomIndex;
        } else {
            // If no candidates meet the threshold, return a random candidate from the entire population
            const allCandidates = Object.keys(populationFitness).map(Number);
            const randomIndex = Math.floor(Math.random() * allCandidates.length);
            return allCandidates[randomIndex];
        }
    }
    return 0;
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
