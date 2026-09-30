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
        const [command, startText, endText, jobLengthDEBUG] = line.trim().split(/\s+/);

        const start = Number(startText);
        const end = Number(endText);
        const jobLength = Number(jobLengthDEBUG);

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
        else if(command == "Stop-Heartbeat"){
            socket.write(JSON.stringify({
                type: "SUBMIT_JOB",
                jobId,
                kind: "stop_heartbeat",
                input: {}
            }) + "\n");
        } else if(command == "Start-Heartbeat"){
            socket.write(JSON.stringify({
                type: "SUBMIT_JOB",
                jobId,
                kind: "start_heartbeat",
                input: {}
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