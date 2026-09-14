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
        ); //Send the register message
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