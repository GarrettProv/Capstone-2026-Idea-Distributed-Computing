import { createConnection } from "node:net";

const workerId = process.argv[2] ?? "worker-1";
const jobsQueue: any[] = []; // Jobs waiting to be processed by this worker
let currentJobId: string | null = null;

let heartbeat = true; //Debug Flag to sim failures

const socket = createConnection(
    {
        host: "127.0.0.1",
        port: 3000
    },
    () => {
        console.log("Connected to coordinator");

        const registerMessage = {
            type: "REGISTER",
            workerId: workerId
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

        if (message.type === "RUN_JOB") {
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

function startNextJob(): void {
    if (currentJobId !== null || jobsQueue.length === 0) {
        return;
    }

    const message = jobsQueue.shift();
    if (!message) return;
    currentJobId = message.jobId;

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

    if (message.kind === "sum_range") {
        const { start, end } = message.input;
        let sum = 0;

        for (let i = start; i <= end; i++) {
            sum += i;
        }

        setTimeout(() => finishJob(sum), message.input.jobLength ?? 0);
    } else if (message.kind === "stop_heartbeat") {
                console.log("Stopping heartbeat messages as requested by the developer.");
                heartbeat = false;
        finishJob("Heart Beat Stopped");
    } else if (message.kind === "start_heartbeat") {
                console.log("Starting heartbeat messages as requested by the developer.");
                heartbeat = true;
        finishJob("Heart Beat Started");
    }
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
