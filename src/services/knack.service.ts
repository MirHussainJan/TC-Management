import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

interface KnackConfig {
    appId: string;
    apiKey: string;
    baseUrl?: string;
}

interface KnackFilter {
    field: string;
    operator: string;
    value: any;
}

interface KnackFilterGroup {
    match: 'and' | 'or';
    rules: (KnackFilter | KnackFilterGroup)[];
}

interface QueryOptions {
    page?: number;
    rows_per_page?: number;
    sort_field?: string;
    sort_order?: 'asc' | 'desc';
    filters?: KnackFilterGroup;
}

class KnackService {
    private client: AxiosInstance;
    private appId: string;
    private apiKey: string;

    constructor(config: KnackConfig) {
        this.appId = config.appId;
        this.apiKey = config.apiKey;

        this.client = axios.create({
            baseURL: config.baseUrl || 'https://api.knack.com/v1',
            proxy: false,
            headers: {
                'X-Knack-Application-Id': this.appId,
                'X-Knack-REST-API-Key': this.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Get all records from an object
     * @param objectKey - The object key (e.g., "object_1")
     * @param options - Query options including pagination, sorting, and filters
     */
    async getRecords(objectKey: string, options?: QueryOptions) {
        try {
            const params: any = {};

            if (options?.page) params.page = options.page;
            if (options?.rows_per_page) params.rows_per_page = options.rows_per_page;
            if (options?.sort_field) params.sort_field = options.sort_field;
            if (options?.sort_order) params.sort_order = options.sort_order;
            if (options?.filters) params.filters = JSON.stringify(options.filters);

            const response = await this.client.get(`/objects/${objectKey}/records`, { params });
            return response.data;
        } catch (error) {
            this.handleError(error, 'getRecords');
        }
    }

    /**
     * Get all records with automatic pagination
     * @param objectKey - The object key
     * @param options - Query options
     */
    async getAllRecords(objectKey: string, options?: Omit<QueryOptions, 'page'>) {
        try {
            let allRecords: any[] = [];
            let currentPage = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                const response = await this.getRecords(objectKey, {
                    ...options,
                    page: currentPage,
                    rows_per_page: options?.rows_per_page || 1000,
                });

                if (response.records && response.records.length > 0) {
                    allRecords = allRecords.concat(response.records);
                    currentPage++;
                    
                    // Check if there are more pages
                    hasMorePages = response.current_page < response.total_pages;
                } else {
                    hasMorePages = false;
                }
            }

            return {
                records: allRecords,
                total_records: allRecords.length,
            };
        } catch (error) {
            this.handleError(error, 'getAllRecords');
        }
    }

    /**
     * Get a single record by ID
     * @param objectKey - The object key
     * @param recordId - The record ID
     */
    async getRecord(objectKey: string, recordId: string) {
        try {
            const response = await this.client.get(`/objects/${objectKey}/records/${recordId}`);
            return response.data;
        } catch (error) {
            this.handleError(error, 'getRecord');
        }
    }

    /**
     * Search records by filters
     * @param objectKey - The object key
     * @param filters - Filter configuration
     * @param options - Additional query options
     */
    async searchRecords(objectKey: string, filters: KnackFilterGroup, options?: Omit<QueryOptions, 'filters'>) {
        try {
            return await this.getRecords(objectKey, {
                ...options,
                filters,
            });
        } catch (error) {
            this.handleError(error, 'searchRecords');
        }
    }

    /**
     * Create a new record
     * @param objectKey - The object key
     * @param data - Record data
     */
    async createRecord(objectKey: string, data: any) {
        try {
            const response = await this.client.post(`/objects/${objectKey}/records`, data);
            return response.data;
        } catch (error) {
            this.handleError(error, 'createRecord');
        }
    }

    /**
     * Update a record
     * @param objectKey - The object key
     * @param recordId - The record ID
     * @param data - Updated data
     */
    async updateRecord(objectKey: string, recordId: string, data: any) {
        try {
            const response = await this.client.put(`/objects/${objectKey}/records/${recordId}`, data);
            return response.data;
        } catch (error) {
            this.handleError(error, 'updateRecord');
        }
    }

    /**
     * Delete a record
     * @param objectKey - The object key
     * @param recordId - The record ID
     */
    async deleteRecord(objectKey: string, recordId: string) {
        try {
            const response = await this.client.delete(`/objects/${objectKey}/records/${recordId}`);
            return response.data;
        } catch (error) {
            this.handleError(error, 'deleteRecord');
        }
    }

    /**
     * Find a single record by field value
     * @param objectKey - The object key
     * @param fieldKey - The field key to search
     * @param value - The value to search for
     */
    async findRecordByField(objectKey: string, fieldKey: string, value: any) {
        try {
            const filters: KnackFilterGroup = {
                match: 'and',
                rules: [
                    {
                        field: fieldKey,
                        operator: 'is',
                        value: value,
                    },
                ],
            };

            const response = await this.searchRecords(objectKey, filters, { rows_per_page: 1 });
            return response?.records?.[0] || null;
        } catch (error) {
            this.handleError(error, 'findRecordByField');
        }
    }

    /**
     * Batch create records
     * @param objectKey - The object key
     * @param records - Array of record data
     */
    async batchCreateRecords(objectKey: string, records: any[]) {
        try {
            const promises = records.map(record => this.createRecord(objectKey, record));
            return await Promise.all(promises);
        } catch (error) {
            this.handleError(error, 'batchCreateRecords');
        }
    }

    /**
     * Batch update records
     * @param objectKey - The object key
     * @param updates - Array of {recordId, data} objects
     */
    async batchUpdateRecords(objectKey: string, updates: Array<{ recordId: string; data: any }>) {
        try {
            const promises = updates.map(update => 
                this.updateRecord(objectKey, update.recordId, update.data)
            );
            return await Promise.all(promises);
        } catch (error) {
            this.handleError(error, 'batchUpdateRecords');
        }
    }

    /**
     * Error handler
     */
    private handleError(error: any, method: string): never {
        const errorMessage = error.response?.data?.errors?.[0] || error.message || 'Unknown error';
        console.error(`[KnackService.${method}] Error:`, errorMessage);
        throw new Error(`Knack API Error in ${method}: ${errorMessage}`);
    }

    /**
     * Build a simple filter
     */
    static buildFilter(field: string, operator: string, value: any): KnackFilterGroup {
        return {
            match: 'and',
            rules: [{ field, operator, value }],
        };
    }

    /**
     * Build an AND filter group
     */
    static buildAndFilter(rules: KnackFilter[]): KnackFilterGroup {
        return {
            match: 'and',
            rules,
        };
    }

    /**
     * Build an OR filter group
     */
    static buildOrFilter(rules: KnackFilter[]): KnackFilterGroup {
        return {
            match: 'or',
            rules,
        };
    }
}

// Create and export singleton instance
const knackService = new KnackService({
    appId: process.env.KNACK_APP_ID || '',
    apiKey: process.env.KNACK_API_KEY || '',
});

export default knackService;
export { KnackService, KnackFilter, KnackFilterGroup, QueryOptions };
