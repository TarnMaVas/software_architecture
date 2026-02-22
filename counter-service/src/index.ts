import Fastify from "fastify";

interface TransactionBody {
  transaction_ID: string;
  timestamp: string;
  user_Id: string;
  amount: number;
}

const app = Fastify({ logger: true });

const balances = new Map<string, number>();

app.post<{ Body: TransactionBody }>("/transaction", async (req) => {
  const { user_Id, amount } = req.body;
  const currentBalance = balances.get(user_Id) || 0;
  const newBalance = currentBalance + amount;
  balances.set(user_Id, newBalance);

  app.log.info(
    `Updated balance for user ${user_Id}: ${currentBalance} -> ${newBalance}`,
  );

  return { balance: newBalance };
});

app.get<{ Params: { user_Id: string }; Reply: { balance: number } }>(
  "/balance/:user_Id",
  async (req) => {
    const { user_Id } = req.params;
    const balance = balances.get(user_Id) || 0;
    app.log.info(`Returning balance for user ${user_Id}: ${balance}`);
    return { balance };
  },
);

app.get<{ Reply: Record<string, number> }>("/balances", async () => {
  app.log.info(`Returning all balances, count: ${balances.size}`);
  return Object.fromEntries(balances.entries());
});

app.post("/reset", async () => {
  balances.clear();
  app.log.info("All balances have been reset");
  return { ok: true };
});

async function start() {
  try {
    await app.listen({ port: 3002, host: "0.0.0.0" });
    app.log.info("Counter service is running on port 3002");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
