import { createServer, type Socket } from "node:net";

type WorkerInfo = {
    socket: Socket;
    status: "HEALTHY" | "UNHEALTHY";
    lastSeen: number;
};

const workers = new Map<string, WorkerInfo>();

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
                    lastSeen: Date.now()
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

                    console.log(`Got Heartbeat from: ${message.workerId}`);
                }
            }

            if(message.type === "DISCONNECT") {

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

    const HEARTBEAT_TIMEOUT_MS = 10_000;

    setInterval(() => {
        const now = Date.now();

        for (const [workerId, worker] of workers.entries()) {
            if (now - worker.lastSeen > HEARTBEAT_TIMEOUT_MS) {
                if(worker.status == "HEALTHY"){
                    worker.status = "UNHEALTHY";
                    console.log(`No Heartbeat recvied from healthy Node: ${workerId}`);
                }
                else if(worker.status == "UNHEALTHY"){
                    console.log(`Worker timed out: ${workerId}`);

                    workers.delete(workerId);
                    worker.socket.destroy();
                }
            }
        }
    }, 10_000);
});