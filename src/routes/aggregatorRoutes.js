import { Router } from "express";
import { getAggregator } from "../controller/aggregatorController.js";

const router = Router();

router.get("/", getAggregator);

export default router;
