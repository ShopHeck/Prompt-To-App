import { Router, type IRouter } from "express";
import healthRouter from "./health";
import projectsRouter from "./projects";
import authRouter from "./auth";
import billingRouter from "./billing";
import refinementRouter from "./refinement";
import webGenerateRouter from "./web-generate";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(billingRouter);
router.use(projectsRouter);
router.use(refinementRouter);
router.use(webGenerateRouter);

export default router;
