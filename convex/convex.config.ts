import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import presence from "@convex-dev/presence/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(rateLimiter);
app.use(presence);

export default app;
