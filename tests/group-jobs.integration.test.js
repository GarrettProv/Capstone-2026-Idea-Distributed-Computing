const { spawn } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

jest.setTimeout(30_000);

const projectRoot = path.resolve(__dirname, "..");
const coordinatorFile = path.join(projectRoot, "src", "coordinator.ts");
const tsxCli = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");

let coordinator;
let coordinatorPort;
let tempDir;
const clients = [];

async function getFreePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
}

function createClient(port) {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const messages = [];
    const waiters = [];
    let buffer = "";

    socket.on("data", data => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (!line.trim()) continue;

            const message = JSON.parse(line);
            messages.push(message);
            for (let i = waiters.length - 1; i >= 0; i--) {
                if (waiters[i].predicate(message)) {
                    clearTimeout(waiters[i].timeout);
                    waiters[i].resolve(message);
                    waiters.splice(i, 1);
                }
            }
        }
    });

    socket.on("error", error => {
        for (const waiter of waiters.splice(0)) {
            clearTimeout(waiter.timeout);
            waiter.reject(error);
        }
    });

    return {
        socket,
        messages,
        send(message) {
            socket.write(JSON.stringify(message) + "\n");
        },
        waitFor(predicate, timeoutMs = 5_000) {
            const existing = messages.find(predicate);
            if (existing) return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                const waiter = { predicate, resolve, reject };
                waiter.timeout = setTimeout(() => {
                    const index = waiters.indexOf(waiter);
                    if (index !== -1) waiters.splice(index, 1);
                    reject(new Error("Timed out waiting for coordinator message"));
                }, timeoutMs);
                waiters.push(waiter);
            });
        }
    };
}

async function connectClient(workerId, role) {
    const client = createClient(coordinatorPort);
    clients.push(client);
    await new Promise((resolve, reject) => {
        client.socket.once("connect", resolve);
        client.socket.once("error", reject);
    });
    client.send({ type: "REGISTER", workerId, role, workerType: role === "island" ? "island" : undefined });
    await client.waitFor(message => message.type === "REGISTERED" && message.workerId === workerId);
    return client;
}

beforeEach(async () => {
    coordinatorPort = await getFreePort();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "capstone-group-test-"));
    coordinator = spawn(process.execPath, [tsxCli, coordinatorFile], {
        cwd: tempDir,
        env: { ...process.env, COORDINATOR_PORT: String(coordinatorPort) },
        stdio: ["ignore", "pipe", "pipe"]
    });

    await new Promise((resolve, reject) => {
        let output = "";
        const timeout = setTimeout(() => reject(new Error(`Coordinator did not start. Output: ${output}`)), 10_000);
        const checkReady = data => {
            output += data.toString();
            if (output.includes(`Coordinator listening on port ${coordinatorPort}`)) {
                clearTimeout(timeout);
                resolve();
            }
        };
        coordinator.stdout.on("data", checkReady);
        coordinator.stderr.on("data", checkReady);
        coordinator.once("error", error => {
            clearTimeout(timeout);
            reject(error);
        });
        coordinator.once("exit", code => {
            clearTimeout(timeout);
            reject(new Error(`Coordinator exited before starting (code ${code}). Output: ${output}`));
        });
    });
});

afterEach(async () => {
    for (const client of clients) client.socket.destroy();
    clients.length = 0;
    if (coordinator && coordinator.exitCode === null) {
        const exited = new Promise(resolve => coordinator.once("exit", resolve));
        coordinator.kill();
        await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))]);
    }
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    coordinator = undefined;
    tempDir = undefined;
});

test("returns the best received score when one group island misses the result window", async () => {
    const islands = await Promise.all([
        connectClient("test-island-1", "island"),
        connectClient("test-island-2", "island")
    ]);
    const developer = await connectClient("Dev-Node", "developer");
    const jobId = "job-partial-results-test";

    developer.send({
        type: "SUBMIT_ISLAND_JOB",
        jobId,
        kind: "OneMax",
        input: { islandAmount: 2 }
    });

    const assignments = await Promise.all(islands.map(island =>
        island.waitFor(message => message.type === "RUN_JOB" && message.groupJobId === jobId)
    ));
    for (let i = 0; i < islands.length; i++) {
        islands[i].send({ type: "STARTING_JOB", workerId: `test-island-${i + 1}`, jobId: assignments[i].jobId });
    }

    islands[0].send({
        type: "JOB_RESULT",
        workerId: "test-island-1",
        jobId: assignments[0].jobId,
        result: 23
    });

    const cancelledJob = await islands[1].waitFor(message =>
        message.type === "GROUP_JOB_COMPLETED" && message.jobId === assignments[1].jobId,
        20_000
    );
    islands[1].send({ type: "JOB_CANCELLED", workerId: "test-island-2", jobId: cancelledJob.jobId });

    const finalMessage = await developer.waitFor(message =>
        (message.type === "JOB_RESULT" || message.type === "JOB_ERROR") && message.jobId === jobId,
        5_000
    );

    expect(finalMessage).toMatchObject({ type: "JOB_RESULT", result: 23, workerId: "test-island-1" });
    const finalMessages = developer.messages.filter(message =>
        (message.type === "JOB_RESULT" || message.type === "JOB_ERROR") && message.jobId === jobId
    );
    expect(finalMessages).toHaveLength(1);
});

test("exchanges candidates after every active island submits for the same round", async () => {
    const islands = await Promise.all([
        connectClient("exchange-island-1", "island"),
        connectClient("exchange-island-2", "island")
    ]);
    const developer = await connectClient("Dev-Node", "developer");
    const jobId = "job-exchange-round-test";

    developer.send({ type: "SUBMIT_ISLAND_JOB", jobId, kind: "OneMax", input: { islandAmount: 2 } });
    const assignments = await Promise.all(islands.map(island =>
        island.waitFor(message => message.type === "RUN_JOB" && message.groupJobId === jobId)
    ));
    for (let i = 0; i < islands.length; i++) {
        islands[i].send({ type: "STARTING_JOB", workerId: `exchange-island-${i + 1}`, jobId: assignments[i].jobId });
    }

    islands[0].send({
        type: "EXCHANGE_BEST_CANDIDATE",
        groupJobId: jobId,
        workerId: "exchange-island-1",
        jobId: assignments[0].jobId,
        exchangeRound: 1,
        bestCandidate: "candidate-from-1"
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(islands[0].messages.concat(islands[1].messages).filter(message =>
        message.type === "BEST_CANDIDATE_EXCHANGE" && message.exchangeRound === 1
    )).toHaveLength(0);

    islands[1].send({
        type: "EXCHANGE_BEST_CANDIDATE",
        groupJobId: jobId,
        workerId: "exchange-island-2",
        jobId: assignments[1].jobId,
        exchangeRound: 1,
        bestCandidate: "candidate-from-2"
    });

    const received = await Promise.all(islands.map(island => island.waitFor(message =>
        message.type === "BEST_CANDIDATE_EXCHANGE" && message.exchangeRound === 1
    )));
    expect(received.map(message => message.newBestCandidate).sort()).toEqual([
        "candidate-from-1",
        "candidate-from-2"
    ]);

    islands.forEach((island, index) => island.send({
        type: "JOB_RESULT",
        workerId: `exchange-island-${index + 1}`,
        jobId: assignments[index].jobId,
        result: index + 1
    }));
    await developer.waitFor(message => message.type === "JOB_RESULT" && message.jobId === jobId, 20_000);
});

test("reassigns a failed group participant to an available healthy island", async () => {
    const islands = await Promise.all([
        connectClient("reassign-island-1", "island"),
        connectClient("reassign-island-2", "island"),
        connectClient("reassign-island-3", "island")
    ]);
    const developer = await connectClient("Dev-Node", "developer");
    const jobId = "job-reassign-test";

    developer.send({ type: "SUBMIT_ISLAND_JOB", jobId, kind: "OneMax", input: { islandAmount: 2 } });
    const assignments = await Promise.all(islands.slice(0, 2).map(island =>
        island.waitFor(message => message.type === "RUN_JOB" && message.groupJobId === jobId)
    ));
    const failedIndex = 0;
    islands[failedIndex].socket.destroy();

    const replacement = await islands[2].waitFor(message =>
        message.type === "RUN_JOB" && message.groupJobId === jobId
    );
    expect(replacement.jobId).toBe(assignments[failedIndex].jobId);

    islands[2].send({ type: "STARTING_JOB", workerId: "reassign-island-3", jobId: replacement.jobId });
    islands[1].send({ type: "STARTING_JOB", workerId: "reassign-island-2", jobId: assignments[1].jobId });
    islands[1].send({ type: "JOB_RESULT", workerId: "reassign-island-2", jobId: assignments[1].jobId, result: 11 });
    islands[2].send({ type: "JOB_RESULT", workerId: "reassign-island-3", jobId: replacement.jobId, result: 29 });

    const finalMessage = await developer.waitFor(message =>
        (message.type === "JOB_RESULT" || message.type === "JOB_ERROR") && message.jobId === jobId,
        20_000
    );
    expect(finalMessage).toMatchObject({ type: "JOB_RESULT", result: 29, workerId: "reassign-island-3" });
});

test("returns one error when every group participant fails before reporting a result", async () => {
    const islands = await Promise.all([
        connectClient("failed-island-1", "island"),
        connectClient("failed-island-2", "island")
    ]);
    const developer = await connectClient("Dev-Node", "developer");
    const jobId = "job-all-failed-test";

    developer.send({ type: "SUBMIT_ISLAND_JOB", jobId, kind: "OneMax", input: { islandAmount: 2 } });
    await Promise.all(islands.map(island =>
        island.waitFor(message => message.type === "RUN_JOB" && message.groupJobId === jobId)
    ));
    islands.forEach(island => island.socket.destroy());

    const error = await developer.waitFor(message => message.type === "JOB_ERROR" && message.jobId === jobId);
    expect(error.error).toBe("All islands failed before returning a result");
    expect(developer.messages.filter(message =>
        (message.type === "JOB_RESULT" || message.type === "JOB_ERROR") && message.jobId === jobId
    )).toHaveLength(1);
});
