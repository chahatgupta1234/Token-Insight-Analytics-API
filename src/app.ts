import express from "express";
import { logger } from "./logger.js";
import { AppError } from "./errors/AppError.js";
import tokenRoutes from "./routes/tokenRoutes.js";

const app = express();

app.use(express.json());

app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const startedAt = Date.now();

    logger.info(
        {
            method: req.method,
            path: req.originalUrl,
            query: req.query,
        },
        "Incoming request"
    );

    res.on("finish", () => {
        logger.info(
            {
                method: req.method,
                path: req.originalUrl,
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
            },
            "Request completed"
        );
    });

    next();
});

app.get("/health", (_req: express.Request, res: express.Response) =>{
    logger.info("Health check requested");  
    
    //say server is running fine 
    res.status(200).json({
        status: "ok",
        message: "Server is running fine"
    })
})

app.use("/api", tokenRoutes);

//404 handler
app.use((req: express.Request, res: express.Response) => {
    logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: {
            code: "NOT_FOUND",
            message: "The requested resource was not found"
        }
    });
});

//error handling middleware
app.use((err:any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if(err instanceof AppError){
        return res.status(err.statusCode || 500).json({
            success: false,
            error: {
                code: err.code || "INTERNAL_SERVER_ERROR",
                message: err.message || "Something went wrong"
            }
        });
    }

    logger.error(err, "Unexpected error occurred");
    res.status(500).json({
        success: false,
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Something went wrong"
        }
    });
});

export default app;
