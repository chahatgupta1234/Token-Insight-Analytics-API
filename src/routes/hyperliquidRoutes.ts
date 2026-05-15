import { Router } from "express";
import { getWalletPnl } from "../controllers/hyperliquidController.js";

const router = Router();

router.get("/hyperliquid/:wallet/pnl", getWalletPnl);

export default router;
