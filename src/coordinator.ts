import { createServer, type Socket } from "node:net";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type WorkerInfo = {
    socket: Socket;
    status: "HEALTHY" | "UNHEALTHY";
    numOfJobs: number;
    lastSeen: number;
    jobsQueueDebug?: string[]; // Optional debug information about the jobs in the queue
    currentJobId?: string | null;
};

enum JobStatus {
    QUEUED = "QUEUED",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}

type JobInfo = {
    jobId: string;
    status: JobStatus;
    assignedWorkerId?: string | null;
    result?: unknown;
    developerSocket: Socket; //So i can track who asked for a job
};

const workers = new Map<string, WorkerInfo>();
const jobs = new Map<string, JobInfo>(); // jobId -> job information
const WORKER_STATE_FILE = resolve(process.cwd(), "worker-state.txt");

async function writeWorkerSnapshot(): Promise<void> {
    const generatedAt = new Date();
    const lines = [
        `Worker state snapshot at ${generatedAt.toISOString()}`,
        `Workers: ${workers.size}`,
        `Jobs: ${jobs.size}`,
        'Jobs Details:',
        ...Array.from(jobs.entries()).map(([jobId, jobInfo]) => {
            return `Job ID: ${jobId}, Status: ${jobInfo.status}, Assigned Worker: ${jobInfo.assignedWorkerId || "None"}, Result: ${jobInfo.result ?? "None"}`;
        }),
        ""
    ];

    for (const [workerId, worker] of workers.entries()) {
        lines.push(
            `ID: ${workerId}`,
            `Status: ${worker.status}`,
            `Current jobs: ${worker.numOfJobs}`,
            `Last heartbeat: ${new Date(worker.lastSeen).toISOString()}`,
            `Jobs in queue: ${worker.jobsQueueDebug?.join(", ") || "None"}`,
            `Current job ID: ${worker.currentJobId || "None"}`,
            ""
        );
    }



    try {
        await writeFile(WORKER_STATE_FILE, lines.join("\n"), "utf8");
    } catch (error) {
        console.error("Could not write worker state snapshot:", error);
    }
}

const server = createServer((socket) => {
    console.log("New connection");

    let buffer = "";
    let registeredWorkerId: string | null = null;

    socket.on("data", (data) => {
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

            if (message.type === "REGISTER") {
                registeredWorkerId = message.workerId;

                workers.set(message.workerId, {
                    socket: socket,
                    status: "HEALTHY",
                    lastSeen: Date.now(),
                    numOfJobs: 0
                });

                console.log(`Registered worker: ${message.workerId}`);

                console.log("Current cluster:");

                for (const workerId of workers.keys()) {
                    console.log(`- ${workerId}`);
                } // Logs all nodes connected

                for (const [workerId, workerInfo] of workers.entries()) {
                    console.log(
                        `Worker ${workerId} is ${workerInfo.status} and last seen at ${new Date(workerInfo.lastSeen).toISOString()}`
                    );
                }


                socket.write(
                    JSON.stringify({
                        type: "REGISTERED",
                        workerId: message.workerId
                    }) + "\n"
                );
            }

            if (message.type === "HEARTBEAT") {
                const worker = workers.get(message.workerId);

                if (worker?.socket === socket) {
                    worker.lastSeen = Date.now();
                    worker.status = "HEALTHY";
                    worker.numOfJobs = message.currentAmountOfJobs;
                    worker.jobsQueueDebug = message.jobsQueueDebug;
                    worker.currentJobId = message.currentJobId; // Store the current job ID if provided

                    console.log(`Got Heartbeat from: ${message.workerId}`);
                }
            }

            //NOT FINISHED YET
            if(message.type === "DISCONNECT") {

            }

            if (message.type === "SUBMIT_JOB") {
               const workerEntry = [...workers.entries()]
                    .filter(([workerId, worker]) =>
                        worker.status === "HEALTHY" && workerId !== "Dev-Node"
                    )
                    .sort(([, workerA], [, workerB]) =>
                        workerA.numOfJobs - workerB.numOfJobs
                    )[0]; // Choose the healthy worker with the fewest jobs


                if (!workerEntry) {
                    socket.write(JSON.stringify({
                        type: "JOB_ERROR",
                        jobId: message.jobId,
                        error: "No healthy workers available"
                    }) + "\n");
                    continue;
                }

                const [workerId, worker] = workerEntry;
                worker.numOfJobs++;
                jobs.set(message.jobId, {
                    jobId: message.jobId,
                    status: JobStatus.QUEUED,
                    assignedWorkerId: workerId,
                    developerSocket: socket // The socket of whoever asked for the job
                });

                worker.socket.write(JSON.stringify({
                    type: "RUN_JOB",
                    jobId: message.jobId,
                    kind: message.kind,
                    input: message.input
                }) + "\n");

                console.log(`Assigned ${message.jobId} to ${workerId}`);
            }

            if(message.type === "STARTING_JOB") {
                const jobInfo = jobs.get(message.jobId);
                if (jobInfo) {
                    jobInfo.status = JobStatus.RUNNING;
                }
            }

            if(message.type === "JOB_RESULT") {
                console.log(`Received result for ${message.jobId}: ${message.result}`);
                const jobInfo = jobs.get(message.jobId);

                const worker = workers.get(message.workerId);
                if (worker) {
                    worker.lastSeen = Date.now();
                    worker.currentJobId = null;
                    worker.numOfJobs = Math.max(0, worker.numOfJobs - 1);
                }

                if (jobInfo) {
                    jobInfo.status = JobStatus.COMPLETED;
                    jobInfo.result = message.result;
                    jobInfo.developerSocket.write(JSON.stringify({
                        type: "JOB_RESULT",
                        jobId: message.jobId,
                        result: message.result
                    }) + "\n");
                }   

                
            }

        }

    });

    socket.on("close", () => {
        console.log("Connection closed");

        if (registeredWorkerId !== null) {
            const worker = workers.get(registeredWorkerId);

            if (worker?.socket === socket) {
                workers.delete(registeredWorkerId);

                console.log(`Removed worker: ${registeredWorkerId}`);
            }
        }
    });

    socket.on("error", (error) => {
        console.log("Socket error:", error.message);
    });
});

server.listen(3000, "127.0.0.1", () => {
    console.log("Coordinator listening on port 3000");

    void writeWorkerSnapshot();
    setInterval(() => {
        void writeWorkerSnapshot();
    }, 3_000);

    const HEARTBEAT_TIMEOUT_MS = 10_000;

    setInterval(() => {
        const now = Date.now();

        for (const [workerId, worker] of workers.entries()) {
            if (now - worker.lastSeen > HEARTBEAT_TIMEOUT_MS) {
                if(worker.status == "HEALTHY" && workerId !== "Dev-Node"){
                    worker.status = "UNHEALTHY";
                    console.log(`No Heartbeat recvied from healthy Node: ${workerId}`);
                }
                else if(worker.status == "UNHEALTHY"){
                    console.log(`Worker timed out: ${workerId}`);
                    //Send message to worker before disconnect
                    worker.socket.write(
                        JSON.stringify({
                            type: "DISCONNECT",
                            reason: "No heartbeat received. Disconnecting."
                        }) + "\n"
                    );
                    
                    workers.delete(workerId);
                    worker.socket.destroy();
                }
            }
        }
    }, 10_000);

    

});
