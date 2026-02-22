"use strict";
const FACADE_URL = process.env.FACADE_URL || "http://localhost:3000";
const COUNTER_URL = process.env.COUNTER_URL || "http://localhost:3002";
const LOGGING_URL = process.env.LOGGING_URL || "http://localhost:3001";
async function makeTransaction(userId, amount) {
    const response = await fetch(`${FACADE_URL}/transaction`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_Id: userId, amount }),
    });
    if (!response.ok) {
        throw new Error(`Transaction failed: ${response.statusText}`);
    }
    return response.json();
}
async function getBalances() {
    const response = await fetch(`${FACADE_URL}/accounts`);
    if (!response.ok) {
        throw new Error(`Failed to get balances: ${response.statusText}`);
    }
    const data = (await response.json());
    return data.accounts;
}
async function getMetrics() {
    const response = await fetch(`${FACADE_URL}/metrics`);
    if (!response.ok) {
        throw new Error(`Failed to get metrics: ${response.statusText}`);
    }
    return response.json();
}
async function resetMetrics() {
    const response = await fetch(`${FACADE_URL}/metrics/reset`, {
        method: "POST",
    });
    if (!response.ok) {
        throw new Error(`Failed to reset metrics: ${response.statusText}`);
    }
}
async function resetAllData() {
    const counterResponse = await fetch(`${COUNTER_URL}/reset`, {
        method: "POST",
    });
    if (!counterResponse.ok) {
        throw new Error(`Failed to reset counter service: ${counterResponse.statusText}`);
    }
    const loggingResponse = await fetch(`${LOGGING_URL}/reset`, {
        method: "POST",
    });
    if (!loggingResponse.ok) {
        throw new Error(`Failed to reset logging service: ${loggingResponse.statusText}`);
    }
    console.log("All data reset successfully");
}
async function getUserInfo(userId) {
    const response = await fetch(`${FACADE_URL}/user/${userId}`);
    if (!response.ok) {
        throw new Error(`Failed to get user info: ${response.statusText}`);
    }
    return response.json();
}
async function runClient(clientId, userId, transactionCount, amount) {
    let successful = 0;
    let failed = 0;
    console.log(`Client ${clientId}: Starting ${transactionCount} transactions for user ${userId}`);
    for (let i = 0; i < transactionCount; i++) {
        try {
            await makeTransaction(userId, amount);
            successful++;
            if ((i + 1) % 1000 === 0) {
                console.log(`Client ${clientId}: Completed ${i + 1}/${transactionCount} transactions`);
            }
        }
        catch (error) {
            failed++;
            console.error(`Client ${clientId}: Transaction ${i + 1} failed:`, error);
        }
    }
    console.log(`Client ${clientId}: Finished. Successful: ${successful}, Failed: ${failed}`);
    return { successful, failed };
}
async function runScenario(scenario, numClients, transactionsPerClient, getUserId, amount = 1) {
    console.log("\n" + "-".repeat(100));
    console.log(`SCENARIO: ${scenario}`);
    console.log("-".repeat(80));
    console.log(`Clients: ${numClients}`);
    console.log(`Transactions per client: ${transactionsPerClient}`);
    console.log(`Total transactions: ${numClients * transactionsPerClient}`);
    console.log("-".repeat(80) + "\n");
    await resetAllData();
    await resetMetrics();
    const startTime = performance.now();
    const clientPromises = [];
    for (let i = 0; i < numClients; i++) {
        const userId = getUserId(i);
        clientPromises.push(runClient(i + 1, userId, transactionsPerClient, amount));
    }
    const results = await Promise.all(clientPromises);
    const endTime = performance.now();
    const totalTimeMs = endTime - startTime;
    const totalTimeSeconds = totalTimeMs / 1000;
    const successfulRequests = results.reduce((sum, r) => sum + r.successful, 0);
    const failedRequests = results.reduce((sum, r) => sum + r.failed, 0);
    const totalRequests = numClients * transactionsPerClient;
    const requestsPerSecond = successfulRequests / totalTimeSeconds;
    const finalBalances = await getBalances();
    const metrics = await getMetrics();
    console.log("\n" + "-".repeat(80));
    console.log("RESULTS:");
    console.log("-".repeat(80));
    console.log(`Total requests: ${totalRequests}`);
    console.log(`Successful requests: ${successfulRequests}`);
    console.log(`Failed requests: ${failedRequests}`);
    console.log(`Total time: ${totalTimeSeconds.toFixed(2)} seconds`);
    console.log(`Requests per second: ${requestsPerSecond.toFixed(2)} req/s`);
    console.log("\nService timing breakdown:");
    console.log(`  Logging service: ${(metrics.logging.timeMS * 1000).toFixed(2)} s (${metrics.logging.calls} calls, avg: ${metrics.logging.averageMs.toFixed(2)} ms)`);
    console.log(`  Counter service: ${(metrics.counter.timeMS * 1000).toFixed(2)} s (${metrics.counter.calls} calls, avg: ${metrics.counter.averageMs.toFixed(2)} ms)`);
    const totalServiceTime = metrics.logging.timeMS + metrics.counter.timeMS;
    if (totalServiceTime > 0) {
        console.log(`  Logging contribution: ${((metrics.logging.timeMS / totalServiceTime) * 100).toFixed(2)}%`);
        console.log(`  Counter contribution: ${((metrics.counter.timeMS / totalServiceTime) * 100).toFixed(2)}%`);
    }
    else {
        console.log("  Logging contribution: 0.00%");
        console.log("  Counter contribution: 0.00%");
    }
    console.log("\nFinal balances:");
    const sortedBalances = Object.entries(finalBalances).sort(([a], [b]) => a.localeCompare(b));
    for (const [userId, balance] of sortedBalances) {
        console.log(`  ${userId}: ${balance}`);
    }
    console.log("-".repeat(80) + "\n");
    return {
        scenario,
        totalRequests,
        totalTimeSeconds,
        requestsPerSecond,
        successfulRequests,
        failedRequests,
        metrics,
        finalBalances,
    };
}
async function runFunctionalTest() {
    console.log("\n" + "-".repeat(80));
    console.log("FUNCTIONAL TEST: Basic System Correctness");
    console.log("-".repeat(80));
    console.log("Testing basic transactions with positive and negative amounts\n");
    try {
        console.log("Test 1: Creating transactions with positive amounts...");
        const tx1 = await makeTransaction("alice", 100);
        console.log(`  - Transaction ${tx1.transaction_ID}: alice +100 -> balance: ${tx1.balance}`);
        const tx2 = await makeTransaction("bob", 50);
        console.log(`  - Transaction ${tx2.transaction_ID}: bob +50 -> balance: ${tx2.balance}`);
        const tx3 = await makeTransaction("alice", 25);
        console.log(`  - Transaction ${tx3.transaction_ID}: alice +25 -> balance: ${tx3.balance}`);
        console.log("\nTest 2: Creating transactions with negative amounts...");
        const tx4 = await makeTransaction("alice", -30);
        console.log(`  - Transaction ${tx4.transaction_ID}: alice -30 -> balance: ${tx4.balance}`);
        const tx5 = await makeTransaction("bob", -10);
        console.log(`  - Transaction ${tx5.transaction_ID}: bob -10 -> balance: ${tx5.balance}`);
        const tx6 = await makeTransaction("charlie", 75);
        console.log(`  - Transaction ${tx6.transaction_ID}: charlie +75 -> balance: ${tx6.balance}`);
        const tx7 = await makeTransaction("charlie", -25);
        console.log(`  - Transaction ${tx7.transaction_ID}: charlie -25 -> balance: ${tx7.balance}`);
        console.log("\nTest 3: Verifying balances via GET /user/:userId...");
        const aliceInfo = await getUserInfo("alice");
        console.log(`  Alice: balance = ${aliceInfo.balance}, transactions = ${aliceInfo.logs.length}`);
        const expectedAliceBalance = 100 + 25 - 30;
        if (aliceInfo.balance === expectedAliceBalance) {
            console.log(`  - Alice balance is correct (expected ${expectedAliceBalance})`);
        }
        else {
            console.error(`  !!! Alice balance is INCORRECT (expected ${expectedAliceBalance}, got ${aliceInfo.balance})`);
        }
        const bobInfo = await getUserInfo("bob");
        console.log(`  Bob: balance = ${bobInfo.balance}, transactions = ${bobInfo.logs.length}`);
        const expectedBobBalance = 50 - 10;
        if (bobInfo.balance === expectedBobBalance) {
            console.log(`  - Bob balance is correct (expected ${expectedBobBalance})`);
        }
        else {
            console.error(`  !!! Bob balance is INCORRECT (expected ${expectedBobBalance}, got ${bobInfo.balance})`);
        }
        const charlieInfo = await getUserInfo("charlie");
        console.log(`  Charlie: balance = ${charlieInfo.balance}, transactions = ${charlieInfo.logs.length}`);
        const expectedCharlieBalance = 75 - 25;
        if (charlieInfo.balance === expectedCharlieBalance) {
            console.log(`  - Charlie balance is correct (expected ${expectedCharlieBalance})`);
        }
        else {
            console.error(`  !!! Charlie balance is INCORRECT (expected ${expectedCharlieBalance}, got ${charlieInfo.balance})`);
        }
        console.log("\nTest 4: Verifying all balances via GET /accounts...");
        const allBalances = await getBalances();
        console.log("  All account balances:");
        for (const [userId, balance] of Object.entries(allBalances).sort(([a], [b]) => a.localeCompare(b))) {
            console.log(`    ${userId}: ${balance}`);
        }
        console.log("\nTest 5: Verifying transaction logs...");
        console.log(`  Alice transactions (${aliceInfo.logs.length}):`);
        for (const log of aliceInfo.logs) {
            console.log(`    ${log.timestamp}: ${log.msg.amount > 0 ? "+" : ""}${log.msg.amount}`);
        }
        console.log(`  Bob transactions (${bobInfo.logs.length}):`);
        for (const log of bobInfo.logs) {
            console.log(`    ${log.timestamp}: ${log.msg.amount > 0 ? "+" : ""}${log.msg.amount}`);
        }
        console.log(`  Charlie transactions (${charlieInfo.logs.length}):`);
        for (const log of charlieInfo.logs) {
            console.log(`    ${log.timestamp}: ${log.msg.amount > 0 ? "+" : ""}${log.msg.amount}`);
        }
        const allCorrect = aliceInfo.balance === expectedAliceBalance &&
            bobInfo.balance === expectedBobBalance &&
            charlieInfo.balance === expectedCharlieBalance &&
            aliceInfo.logs.length === 3 &&
            bobInfo.logs.length === 2 &&
            charlieInfo.logs.length === 2;
        console.log("\n" + "-".repeat(80));
        if (allCorrect) {
            console.log("FUNCTIONAL TEST PASSED: All balances and logs are correct!");
        }
        else {
            console.log("FUNCTIONAL TEST FAILED: Some balances or logs are incorrect!");
        }
        console.log("-".repeat(80) + "\n");
    }
    catch (error) {
        console.error("Functional test failed with error:", error);
        throw error;
    }
}
async function main() {
    console.log("Starting load tests for facade-service");
    console.log(`Target URL: ${FACADE_URL}`);
    const results = [];
    try {
        await runFunctionalTest();
        console.log("Beginning load tests...\n");
        // Scenario 1: 10 clients, each making 10K transactions to their own account
        const result1 = await runScenario("10 clients, 10K transactions each to separate accounts", 10, 10000, (clientId) => `user-${clientId + 1}`, 1);
        results.push(result1);
        const expectedAccounts = Array.from({ length: 10 }, (_, i) => `user-${i + 1}`);
        let scenario1Valid = true;
        for (const userId of expectedAccounts) {
            const balance = result1.finalBalances[userId] || 0;
            const expected = 10000;
            if (balance !== expected) {
                console.error(`!!! Scenario 1 FAILED: ${userId} has balance ${balance}, expected ${expected}`);
                scenario1Valid = false;
            }
        }
        if (scenario1Valid) {
            console.log("- Scenario 1 PASSED: All accounts have correct balance\n");
        }
        console.log("Beginning scenario 2...\n");
        const result2 = await runScenario("10 clients, 10K transactions each to the same account", 10, 10000, () => "shared-account", 1);
        results.push(result2);
        const sharedBalance = result2.finalBalances["shared-account"] || 0;
        const expectedShared = 100000;
        if (sharedBalance === expectedShared) {
            console.log(`- Scenario 2 PASSED: Shared account has correct balance (${sharedBalance})\n`);
        }
        else {
            console.error(`!!! Scenario 2 FAILED: Shared account has balance ${sharedBalance}, expected ${expectedShared}\n`);
        }
        console.log("\n" + "=".repeat(80));
        console.log("SUMMARY");
        console.log("=".repeat(80));
        for (const result of results) {
            console.log(`\n${result.scenario}:`);
            console.log(`  RPS: ${result.requestsPerSecond.toFixed(2)} req/s`);
            console.log(`  Time: ${result.totalTimeSeconds.toFixed(2)}s`);
            console.log(`  Success rate: ${((result.successfulRequests / result.totalRequests) * 100).toFixed(2)}%`);
        }
        console.log("=".repeat(80) + "\n");
    }
    catch (error) {
        console.error("Load test failed:", error);
        process.exit(1);
    }
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
