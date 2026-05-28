import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);

export default router;
