import { Router } from "express";
import { getTokenInsight } from "../controllers/tokenController.js";

const router = Router();

router.post('/token/:id/insight', getTokenInsight);

export default router;