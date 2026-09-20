import { createServer, type Socket } from "node:net";

type WorkerInfo = {
    socket: Socket;
    status: "HEALTHY";
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

                socket.write(
                    JSON.stringify({
                        type: "REGISTERED",
                        workerId: message.workerId
                    }) + "\n"
                );
            }

            if (message.type === "HEARTBEAT") {
                workers.set(message.workerId, {
                    socket: socket,
                    status: "HEALTHY",
                    lastSeen: message.currentTime
                });

                console.log(`Got Heartbeat from: ${message.workerId}`);
            }
        }
    });

    socket.on("close", () => {
        console.log("Connection closed");

        if (registeredWorkerId !== null) {
            const worker = workers.get(registeredWorkerId);

            // Make sure this is still the same connection
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
    console.log("Atlas coordinator listening on port 3000");
});