import { createConnection } from "node:net";
import { createInterface } from "node:readline";

const socket = createConnection({ host: "127.0.0.1", port: 3000 }, () => {
    console.log("Connected. Enter a job code to submit a job");

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

    terminal.prompt();

    terminal.on("line", (line) => {
        const [command, input1, input2, input3] = line.trim().split(/\s+/);

        const start = Number(input1);
        const end = Number(input2);
        const jobLength = Number(input3);

        const jobId = `job-${Date.now()}`;
        if(command == "sum"){
            socket.write(JSON.stringify({
                type: "SUBMIT_JOB",
                jobId,
                kind: "sum_range",
                input: { start, end, jobLength }
            }) + "\n");

            console.log(`Submitted ${jobId}: sum ${start} through ${end}`);
        }

        if(command == "simFailure"){
            const start = 1;
            const end = 100;
            const jobLength = 100000;
            socket.write(JSON.stringify({
                type: "SIMULATE_FAILURE",
                jobId: jobId,
                kind: input2,
                targetWorkerId: input1,
                input: { start, end, jobLength }
            }) + "\n");
        }

        else if(command == "Stop-Heartbeat"){
            socket.write(JSON.stringify({
                type: "HEARTBEAT_CONTROL",
                action: "stop",
                targetWorkerId: input1
            }) + "\n");
        } else if(command == "Start-Heartbeat"){
            socket.write(JSON.stringify({
                type: "HEARTBEAT_CONTROL",
                action: "start",
                targetWorkerId: input1
            }) + "\n");
        }


        terminal.prompt();
    });


    let buffer = "";
    socket.on("data", (data) => {
        console.log("\nCoordinator:", data.toString().trim());
        terminal.prompt();


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

            if(message.type === "JOB_RESULT") {
                console.log(`Received result for ${message.jobId}: ${message.result}`);
            }
        }

    });
});
