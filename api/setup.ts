import { User } from "@/models/user-model";
import cors from "@elysiajs/cors";
import { cron } from "@elysiajs/cron";
import { logger } from "@rasla/logify";
import dayjs from "dayjs";
import { Elysia } from "elysia";
import { connect } from "mongoose";
import { baseRouter } from "./src/controllers";
import { swagger } from "@elysiajs/swagger";
import { sendNotification } from "@/lib/firebase";

const app = new Elysia();

app.use(cors());

try {
  await connect(process.env.DB_URL as string, {
    dbName: "ecommerce",
  });
  console.log("Connected to MongoDB");
} catch (e) {
  console.log(e);
}

app.use(
  swagger({
    path: "/api/docs",
    exclude: ["/docs", "/docs/json"],
    theme: "dark",
    documentation: {
      servers: [
        {
          url: "/",
        },
      ],
      info: {
        title: "Ecommerce API",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            scheme: "bearer",
            type: "http",
            bearerFormat: "JWT",
          },
        },
      },
    },
  })
);

// @ts-ignore
app.use(logger({ console: true, skip: ["/docs", "/docs/json"] }));

app.use(baseRouter);

app.use(
  cron({
    name: "clear-attempts-daily",
    // Run at 12:00 AM every day
    pattern: "0 0 * * *",
    async run() {
      try {
        const result = await User.updateMany({}, { $set: { attempts: [] } });

        console.log(
          `✅ Cleared attempts for ${
            result.modifiedCount
          } users at ${dayjs().format()}`
        );
      } catch (error) {
        console.error("❌ Error clearing attempts:", error);
      }
    },
  })
);

app.onError(({ code, error, set }) => {
  set.status = "Internal Server Error";
  return {
    message: error,
    ok: false,
  };
});
await sendNotification(
  "dlhjPmG5U7OpxgFwRFdtOv:APA91bGi066Nxx4WU9qh0L0I5BzkgGhbSwW56iWlrslREhDja6PHn1x9xO4xmDIfpGnlTE9J3NczupTjnjDsFupG2tqjD-BcqJ0tsPkRFU1f45SKTRUW7OM",
  "Test Notification",
  "This is a test notification"
)
// setInterval(() => {
//   broadcastMessage("New Order Received");
// }, 2000);

export { app };
