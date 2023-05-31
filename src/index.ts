// import { activationTask } from "./activationTask";
// import { AsyncTask, ToadScheduler, SimpleIntervalJob } from "toad-scheduler";
// import { logger } from "./logger";
//
// logger.verbose("Starting scheduler...");
// logger.verbose("Interval", process.env.INTERVAL_SECS);
// logger.verbose("Node", process.env.PEER);
// logger.verbose("Cache", process.env.CACHE_PATH);
// logger.verbose("===== GO ======");
//
// activationTask().then(() => {
//   const scheduler = new ToadScheduler();
//   const task = new AsyncTask("activation", activationTask);
//   const job = new SimpleIntervalJob(
//     { seconds: parseInt(process.env.INTERVAL_SECS || "30") },
//     task
//   );
//   scheduler.addSimpleIntervalJob(job);
// });
