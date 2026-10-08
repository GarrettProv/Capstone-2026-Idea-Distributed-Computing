import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const socket = createConnection({ host: "127.0.0.1", port: 3000 }, () => {
    console.log("Connected to coordinator. Type help for developer commands.");

    socket.write(JSON.stringify({
        type: "REGISTER",
        workerId: "Dev-Node",
        role: "developer"
    }) + "\n");

    const terminal = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "> "
    });
    const pendingJobs = new Set<string>();

    const printHelp = (): void => {
        console.log("Commands:");
        console.log("  sum <start> <end> <milliseconds>       Submit one sum job");
        console.log("  batch <count> <start> <end> <ms>       Submit repeated sum jobs (count 1-100)");
        console.log("  simFailure <workerId> <jobKind>         Run a job, then stop that worker's heartbeat");
        console.log("  Stop-Heartbeat <workerId>               Stop a worker's heartbeat");
        console.log("  Start-Heartbeat <workerId>              Restart a worker's heartbeat");
        console.log("  status                                  Show this client's pending jobs");
        console.log("  help                                    Show commands");
    };

    const makeJobId = (): string => `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const submitSum = (start: number, end: number, jobLength: number): string => {
        const jobId = makeJobId();
        pendingJobs.add(jobId);
        socket.write(JSON.stringify({
            type: "SUBMIT_JOB",
            jobId,
            kind: "sum_range",
            input: { start, end, jobLength }
        }) + "\n");
        return jobId;
    };

    terminal.prompt();
    terminal.on("line", (line) => {
        const [command, ...args] = line.trim().split(/\s+/);

        if (command === "help") {
            printHelp();
        } else if (command === "sum") {
            const [start, end, jobLength] = args.map(Number);
            if (args.length !== 3 || ![start, end, jobLength].every(Number.isFinite)) {
                console.log("Usage: sum <start> <end> <milliseconds>");
            } else {
                const jobId = submitSum(start, end, jobLength);
                console.log(`Submitted ${jobId}: sum ${start} through ${end}`);
            }
        } else if (command === "oneMax") {
            const [bitLength, genAmount, populationSize, islandAmount, jobLength] = args.map(Number);
            if (args.length !== 5 || ![bitLength, genAmount, populationSize, islandAmount, jobLength].every(Number.isFinite)) {
                console.log("Usage: oneMax <bitLength> <genAmount> <populationSize> <islandAmount> <milliseconds>");
            } else {
                const jobId = makeJobId();
                pendingJobs.add(jobId);
                socket.write(JSON.stringify({
                    type: "SUBMIT_ISLAND_JOB",
                    jobId,
                    kind: "OneMax",
                    islandAmount: islandAmount,
                    input: { bitLength, genAmount, populationSize, jobLength }
                }) + "\n");
                console.log(`Submitted ${jobId}: oneMax with bit length ${bitLength}, generations ${genAmount}`);
            }

        } else if (command === "batch") {
            const [count, start, end, jobLength] = args.map(Number);
            if (args.length !== 4 || !Number.isInteger(count) || count < 1 || count > 100 ||
                ![start, end, jobLength].every(Number.isFinite)) {
                console.log("Usage: batch <count 1-100> <start> <end> <milliseconds>");
            } else {
                for (let i = 0; i < count; i++) {
                    const jobId = submitSum(start, end, jobLength);
                    console.log(`Submitted ${i + 1}/${count}: ${jobId} (sum ${start} through ${end})`);
                }
            }
        } else if (command === "status") {
            console.log(`Pending jobs submitted by this client: ${pendingJobs.size}`);
            socket.write(JSON.stringify({ type: "GET_STATUS" }) + "\n");
        } else if (command === "simFailure") {
            const [workerId, jobKind] = args;
            if (!workerId || !jobKind) {
                console.log("Usage: simFailure <workerId> <jobKind>");
            } else {
                const jobId = makeJobId();
                pendingJobs.add(jobId);
                socket.write(JSON.stringify({
                    type: "SIMULATE_FAILURE",
                    jobId,
                    kind: jobKind,
                    targetWorkerId: workerId,
                    input: { start: 1, end: 100, jobLength: 100000 }
                }) + "\n");
            }
        } else if (command === "Stop-Heartbeat" || command === "Start-Heartbeat") {
            const targetWorkerId = args[0];
            if (!targetWorkerId) {
                console.log(`Usage: ${command} <workerId>`);
            } else {
                socket.write(JSON.stringify({
                    type: "HEARTBEAT_CONTROL",
                    action: command === "Stop-Heartbeat" ? "stop" : "start",
                    targetWorkerId
                }) + "\n");
            }
        } else if (command) {
            console.log(`Unknown command: ${command}. Type help to see commands.`);
        }

        terminal.prompt();
    });

    let buffer = "";
    socket.on("data", (data) => {
        buffer += data.toString();
        let newlineIndex: number;

        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim() === "") continue;

            const message = JSON.parse(line);
            if (message.type === "JOB_RESULT") {
                pendingJobs.delete(message.jobId);
                console.log(`\nReceived result for ${message.jobId}: ${message.result}`);
            } else if (message.type === "JOB_ERROR") {
                if (message.jobId) pendingJobs.delete(message.jobId);
                console.log(`\nJob error${message.jobId ? ` (${message.jobId})` : ""}: ${message.error}`);
            } else if (message.type === "REGISTERED") {
                console.log(`\nRegistered with coordinator as ${message.workerId}`);
            } else if (message.type === "HEARTBEAT_CONTROLLED") {
                console.log(`\n${message.action === "stop" ? "Stopped" : "Started"} heartbeat for ${message.workerId}`);
            } else if (message.type === "CLUSTER_STATUS") {
                console.log("\nWorkers:");
                if (message.workers.length === 0) console.log("  No workers connected");
                for (const worker of message.workers) {
                    console.log(`  ${worker.workerId}: ${worker.status}, ${worker.currentJobs} job(s), current: ${worker.currentJobId ?? "none"}`);
                }
                console.log("Jobs:");
                if (message.jobs.length === 0) console.log("  No jobs submitted");
                for (const job of message.jobs) {
                    console.log(`  ${job.jobId}: ${job.status}, worker: ${job.assignedWorkerId ?? "none"}`);
                }
            }
        }

        terminal.prompt();
    });
});
