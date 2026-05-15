import axios from "axios";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableError = (error: unknown) => {
    if (!axios.isAxiosError(error)) {
        return false;
    }

    const status = error.response?.status;

    return (
        error.code === "ECONNABORTED" ||
        status === 429 ||
        (status !== undefined && status >= 500)
    );
};

export async function retryOnce<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isRetryableError(error)) {
            throw error;
        }

        await wait(1000);
        return operation();
    }
}
