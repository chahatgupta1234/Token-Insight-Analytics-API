export class AppError extends Error {
    constructor(
        public code: string,
        public statusCode: number,
        public message: string
    ) {
        super(message);
    }

    toJSON() {
        return {
            code: this.code,
            statusCode: this.statusCode,
            message: this.message
        }
    };

}