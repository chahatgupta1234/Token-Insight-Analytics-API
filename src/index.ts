import app from "./app.js";
import { config } from "./config.js";
import { logger } from "./logger.js";


const start = async () => {
    //catch error while starting server and log it
    try {
        app.listen(config.PORT, (error?: Error) => {
            if (error) {
                logger.error(error, "Error starting server");
                process.exit(1);
            }

            logger.info(`Server started on port ${config.PORT} in ${config.NODE_ENV} mode`);
        });

    }catch (error) {
        logger.error(error,"Error starting server");
        process.exit(1);
    }
}

start();
