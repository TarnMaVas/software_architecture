import Fastify from "fastify";

interface TransactionMsg {
  user_Id: string;
  amount: number;
}

interface TransactionBody extends TransactionMsg {
  transaction_ID: string;
  timestamp: string;
}

interface LogEntry {
  timestamp: string;
  msg: TransactionMsg;
}

const logMap = new Map<string, LogEntry>();

const app = Fastify({ logger: true });

app.post<{ Body: TransactionBody }>("/transaction", async (req) => {
  const { user_Id, amount, transaction_ID, timestamp } = req.body;

  const logEntry: LogEntry = {
    timestamp,
    msg: { user_Id, amount },
  };

  logMap.set(transaction_ID, logEntry);

  app.log.info(
    `Logged transaction ${transaction_ID} for user ${user_Id} with amount ${amount} at ${timestamp}`,
  );

  return { ok: true };
});

app.get<{
  Params: { user_Id: string };
  Reply: Array<{
    transaction_ID: string;
    timestamp: string;
    msg: TransactionMsg;
  }>;
}>("/transaction/:user_Id", async (req) => {
  const { user_Id } = req.params;
  const userLogs = Array.from(logMap.entries())
    .filter(([, entry]) => entry.msg.user_Id === user_Id)
    .map(([transaction_ID, entry]) => ({
      transaction_ID,
      timestamp: entry.timestamp,
      msg: entry.msg,
    }));

  app.log.info(
    `Returning transactions for user ${user_Id}, count: ${userLogs.length}`,
  );

  return userLogs;
});

app.get<{
  Reply: {
    transactions: Array<{
      transaction_ID: string;
      timestamp: string;
      msg: TransactionMsg;
    }>;
  };
}>("/transactions", async () => {
  const transactions = Array.from(logMap.entries()).map(
    ([transaction_ID, entry]) => ({
      transaction_ID,
      timestamp: entry.timestamp,
      msg: entry.msg,
    }),
  );

  app.log.info(`Returning all transactions, count: ${transactions.length}`);

  return { transactions };
});

app.post("/reset", async () => {
  logMap.clear();
  app.log.info("All transaction logs have been reset");
  return { ok: true };
});

async function start() {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
    app.log.info("Logging service is running on port 3001");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
