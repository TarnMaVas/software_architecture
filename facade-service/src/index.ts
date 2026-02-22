import Fastify from "fastify";
import { randomUUID } from "crypto";

interface TransactionMsg {
  user_Id: string;
  amount: number;
}

interface TransactionBody extends TransactionMsg {
  transaction_ID: string;
  timestamp: string;
}

interface TransactionLog {
  transaction_ID: string;
  timestamp: string;
  msg: TransactionMsg;
}

interface UserBalance {
  user_Id: string;
  balance: number;
}

interface Metrics {
  logging: {
    averageMs: number;
    calls: number;
    timeMS: number;
  };
  counter: {
    averageMs: number;
    calls: number;
    timeMS: number;
  };
}

const app = Fastify({ logger: true });

const LOGGING_SERVICE_URL = process.env.LOGGING_URL || "http://logging-service:3001";
const COUNTER_SERVICE_URL = process.env.COUNTER_URL || "http://counter-service:3002";

let loggingTimeMS = 0;
let counterTimeMS = 0;
let loggingCalls = 0;
let counterCalls = 0;

async function timedFetch(
  url: string,
  init?: RequestInit,
): Promise<{ ms: number; res: Response }> {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const t1 = performance.now();
  return { ms: t1 - t0, res };
}

app.post<{ Body: TransactionMsg }>("/transaction", async (req) => {
  const transactionBody: TransactionBody = {
    ...req.body,
    transaction_ID: randomUUID(),
    timestamp: new Date().toISOString(),
  };

  const pLog = (async () => {
    const { ms, res } = await timedFetch(`${LOGGING_SERVICE_URL}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody),
    });
    loggingTimeMS += ms;
    loggingCalls++;
    if (!res.ok) {
      app.log.error(`Failed to log transaction: ${res.statusText}`);
    }
  })();

  const pCounter = (async () => {
    const { ms, res } = await timedFetch(`${COUNTER_SERVICE_URL}/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_Id: transactionBody.user_Id,
        amount: transactionBody.amount,
      }),
    });
    counterTimeMS += ms;
    counterCalls++;
    try {
      const data = (await res.json()) as { balance: number };
      return data;
    } catch (err) {
      app.log.error({ err }, "Failed to parse counter response");
    }
  })();

  try {
    const [, counterRes] = await Promise.all([pLog, pCounter]);
    return {
      transaction_ID: transactionBody.transaction_ID,
      balance: counterRes?.balance ?? null,
    };
  } catch (err) {
    app.log.error({ err }, "Failed to process transaction");
    throw err;
  }
});

app.get<{
  Params: { user_Id: string };
  Reply: { balance: number | null; logs: Array<TransactionLog> };
}>("/user/:user_Id", async (req) => {
  const { user_Id } = req.params;

  const pBalance = (async () => {
    const { ms, res } = await timedFetch(
      `${COUNTER_SERVICE_URL}/balance/${user_Id}`,
    );
    counterTimeMS += ms;
    counterCalls++;
    try {
      const data = (await res.json()) as { balance: number };
      return data;
    } catch (err) {
      app.log.error({ err }, "Failed to parse counter response");
      throw err;
    }
  })();

  const pLogs = (async () => {
    const { ms, res } = await timedFetch(
      `${LOGGING_SERVICE_URL}/transaction/${user_Id}`,
    );
    loggingTimeMS += ms;
    loggingCalls++;

    try {
      const data = (await res.json()) as Array<TransactionLog>;
      return data;
    } catch (err) {
      app.log.error({ err }, "Failed to parse logging response");
      throw err;
    }
  })();

  try {
    const [balance, logs] = await Promise.all([pBalance, pLogs]);
    return { balance: balance?.balance ?? null, logs };
  } catch (err) {
    app.log.error({ err }, "Failed to get user info");
    throw err;
  }
});

app.get<{ Reply: { accounts: Record<string, number> } }>("/accounts", async () => {
  const { ms, res } = await timedFetch(`${COUNTER_SERVICE_URL}/balances`);
  counterTimeMS += ms;
  counterCalls++;

  try {
    const data = (await res.json()) as Record<string, number>;
    return { accounts: data };
  } catch (err) {
    app.log.error({ err }, "Failed to parse counter response");
    throw err;
  }
});

app.get<{ Reply: Metrics }>("/metrics", async () => {
  return {
    logging: {
      averageMs: loggingCalls > 0 ? loggingTimeMS / loggingCalls : 0,
      calls: loggingCalls,
      timeMS: loggingTimeMS,
    },
    counter: {
      averageMs: counterCalls > 0 ? counterTimeMS / counterCalls : 0,
      calls: counterCalls,
      timeMS: counterTimeMS,
    },
  };
});

app.post("/metrics/reset", async () => {
  loggingTimeMS = 0;
  counterTimeMS = 0;
  loggingCalls = 0;
  counterCalls = 0;
  return { ok: true };
});

async function start() {
  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
    app.log.info("Facade service is running on port 3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
