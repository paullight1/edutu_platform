import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
} from '@nestjs/common';
import { ZodError } from 'zod';
import type { ZodSchema } from 'zod';
import { AppException, ErrorCode } from '../errors';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    // Only validate body and query params — skip others
    if (metadata.type !== 'body' && metadata.type !== 'query') {
      return value;
    }

    const result = this.schema.safeParse(value);

    if (!result.success) {
      const zodError = result.error as ZodError;
      const fieldErrors: Record<string, string[]> = {};

      for (const issue of zodError.issues) {
        const path = issue.path.join('.') || '_root';
        if (!fieldErrors[path]) {
          fieldErrors[path] = [];
        }
        fieldErrors[path].push(issue.message);
      }

      throw AppException.validationFailed(
        ErrorCode.VALIDATION_ERROR,
        'Validation failed',
        { fields: fieldErrors },
      );
    }

    return result.data;
  }
}
