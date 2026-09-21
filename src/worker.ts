import { createConnection } from "node:net";

const workerId = process.argv[2] ?? "worker-1";

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

        const HEARTBEAT_INTERVAL_MS: number = 30 * 60 * 1000;

        function sendHeartbeat(): void {
            const currentTimestamp: string = new Date().toISOString();
            const heartbeatMessage = {
                type: "HEARTBEAT",
                workerId: workerId,
                currentTime: currentTimestamp
            };

            console.log("Sent Heartbeat Message");
            socket.write(
                JSON.stringify(heartbeatMessage) + "\n"
            );
        }
        sendHeartbeat();

        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    }
);

socket.on("data", (data) => { //Get any data from coordinator
    console.log(
        "Message from coordinator:",
        data.toString().trim()
    ); 
});

socket.on("close", () => {
    
    console.log("Disconnected from coordinator");
});

socket.on("error", (error) => {
    console.log("Connection error:", error.message);
});