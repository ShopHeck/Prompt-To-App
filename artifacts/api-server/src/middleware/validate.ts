import type { Request, Response, NextFunction } from "express";
import { type ZodSchema } from "zod";

/**
 * Express middleware that validates `req.body` against a Zod schema.
 * Returns 400 with structured error details on validation failure.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));

      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Express middleware that validates `req.query` against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));

      res.status(400).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    req.query = result.data;
    next();
  };
}
