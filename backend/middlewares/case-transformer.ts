import { NextFunction, Request, Response } from "express";

function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}

export function transformKeysSnakeToCamel(obj: any): any {
    // Handle null/undefined values
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    // Handle Date objects - don't transform them
    if (obj instanceof Date) {
        return obj;
    }
    
    // Check if it's a string that looks like a date
    if (typeof obj === 'string' && 
        (obj.match(/^\d{4}-\d{2}-\d{2}T/) || // ISO date format
         obj.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/))) { // PostgreSQL timestamp format
        return obj;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(transformKeysSnakeToCamel);
    }
    
    // Handle objects (excluding null)
    if (typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                snakeToCamel(key),
                transformKeysSnakeToCamel(value)
            ])
        );
    }
    
    // Return primitive values as-is
    return obj;
}

export const transformResponseToCamelCase = (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(body: any): Response {
        if (body && typeof body === 'object') {
            body = transformKeysSnakeToCamel(body);
        }
        return originalSend.call(this, body);
    };
    
    next();
};