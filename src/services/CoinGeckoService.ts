import axios from 'axios';
import { logger } from '../logger.js';
import { AppError } from '../errors/AppError.js';
import { tokenResponseSchema } from '../schemas/tokenSchema.js';
import type { TokenData } from '../types/index.js';
import { retryOnce } from '../utils/retryOnce.js';

class CoinGeckoService {
    private baseUrl= 'https://api.coingecko.com/api/v3';
    private cache = new Map<string, { data: TokenData; expiresAt: number }>();
    private cacheTtlMs = 30_000; // 30 seconds

    async getTokenData(id: string, vs_currency: string = 'usd', history_days: number = 30): Promise<TokenData> {
        const startedAt = Date.now();

        try {
            const cacheKey = `${id}:${vs_currency}:${history_days}`;
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                logger.info(
                    {
                        provider: "coingecko",
                        tokenId: id,
                        vsCurrency: vs_currency,
                        cacheKey,
                    },
                    "CoinGecko cache hit"
                );
                return cached.data;
            }

            const params = {
                localization: false,
                tickers: false,
                market_data: true,
                community_data: false,
                developer_data: false,
                sparkline: false,
                include_categories_details: false,
                dex_pair_format: 'symbol',
            };
            const url = `${this.baseUrl}/coins/${id}`;

            logger.info(
                {
                    provider: "coingecko",
                    tokenId: id,
                    vsCurrency: vs_currency,
                    url,
                    params,
                },
                "CoinGecko request started"
            );

            const response = await retryOnce(() => 
                    axios.get(url, {
                    params,
                    headers: {
                        Accept: 'application/json',
                        'User-Agent': 'Token Insight Backend/1.0',
                    },
                    timeout: 10000, // 10 seconds timeout
                })
            );
            

            logger.info(
                {
                    provider: "coingecko",
                    tokenId: id,
                    status: response.status,
                    durationMs: Date.now() - startedAt,
                    cacheControl: response.headers["cache-control"],
                    cfCacheStatus: response.headers["cf-cache-status"],
                },
                "CoinGecko request completed"
            );

            const validatedData = tokenResponseSchema.safeParse(response.data);
            if (!validatedData.success) {
                logger.error(`CoinGecko API response validation failed for token ${id}: ${JSON.stringify(validatedData.error)}`);
                throw new AppError('VALIDATION_ERROR', 500, 'Failed to validate CoinGecko API response');
            }

            const data = validatedData.data;

            // Extract price for requested currency
            const currentPrice = data.market_data.current_price[vs_currency];
            if (!currentPrice) {
                throw new AppError('INVALID_CURRENCY', 404, `Currency ${vs_currency} not supported`);
            }

            // Extract other values or use 0 as fallback
            const marketCap = data.market_data.market_cap[vs_currency] ?? 0;
            const totalVolume = data.market_data.total_volume[vs_currency] ?? 0;

            //add history_days to the token data
            const historyResponse = await retryOnce(() =>
                axios.get(`${this.baseUrl}/coins/${id}/market_chart`, {
                    params: {
                        vs_currency,
                        days: history_days,
                        interval: "daily",
                    },
                    timeout: 10000,
                })
            );

            const prices = Array.isArray(historyResponse.data.prices) ? historyResponse.data.prices : [];
            const firstPrice = prices[0]?.[1];
            const lastPrice = prices[prices.length - 1]?.[1];
            const historyPriceChangePercentage = firstPrice && lastPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
                        
            const tokenData = {
                id: data.id,
                symbol: data.symbol,
                name: data.name,
                vs_currency,
                market_data: {
                    current_price: currentPrice,
                    market_cap: marketCap,
                    total_volume: totalVolume,
                    price_change_percentage_24h: data.market_data.price_change_percentage_24h,
                },
                history: {
                    days: history_days,
                    start_price: firstPrice ?? 0,
                    end_price: lastPrice ?? 0,
                    price_change_percentage: historyPriceChangePercentage,
                },
            };

            this.cache.set(cacheKey, {
                data: tokenData,
                expiresAt: Date.now() + this.cacheTtlMs,
            });

            return tokenData;
            
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            if (axios.isAxiosError(error)) {
                logger.error(
                    {
                        provider: "coingecko",
                        tokenId: id,
                        vsCurrency: vs_currency,
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        durationMs: Date.now() - startedAt,
                        retryAfter: error.response?.headers["retry-after"],
                        cfRay: error.response?.headers["cf-ray"],
                        responseBody: error.response?.data,
                        message: error.message,
                    },
                    "CoinGecko request failed"
                );

                if(error.response?.status === 404){
                    throw new AppError('TOKEN_NOT_FOUND', 404, `Token with id ${id} not found on CoinGecko`);
                }

                if (error.response?.status === 429) {
                    const retryAfter = error.response.headers["retry-after"];
                    throw new AppError(
                        'COINGECKO_RATE_LIMITED',
                        429,
                        retryAfter
                            ? `CoinGecko rate limit exceeded. Retry after ${retryAfter} seconds`
                            : 'CoinGecko rate limit exceeded. Try again later'
                    );
                }

                throw new AppError('COINGECKO_API_ERROR', error.response?.status || 500, `Error fetching data from CoinGecko: ${error.message}`);
            }
            logger.error(`Unexpected error in CoinGeckoService.getTokenData for token ${id}: ${error instanceof Error ? error.stack : String(error)}`);
            throw new AppError('INTERNAL_SERVER_ERROR', 500, 'An unexpected error occurred while fetching token data');
            
        }
    }
}
export const coinGeckoService = new CoinGeckoService();
